import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTrustedSender, looksLikeCredit, parseSms } from "@/lib/payments/sms";

/**
 * Receives Mobile Money confirmation SMS relayed from the phone holding the
 * merchant SIM, and settles the matching booking.
 *
 * Contract with the relay app:
 *   POST /api/momo/sms
 *   x-momo-relay-secret: <MOMO_RELAY_SECRET>
 *   { "from": "MobileMoney", "body": "<texte brut du SMS>" }
 *
 * Always answers 200 once authenticated, including when nothing matched: relay
 * apps retry on non-2xx, and a message we cannot parse will never parse on the
 * second attempt either. The outcome is in the body and in the admin log.
 */

function secretMatches(provided: string | null, expected: string) {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expectedSecret = process.env.MOMO_RELAY_SECRET;

  // Without a configured secret the endpoint would be an open door onto the
  // bookings table, so it stays shut rather than defaulting to permissive.
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Relais non configuré (MOMO_RELAY_SECRET absent)." },
      { status: 503 }
    );
  }

  if (!secretMatches(request.headers.get("x-momo-relay-secret"), expectedSecret)) {
    return NextResponse.json({ error: "Secret invalide." }, { status: 401 });
  }

  let payload: { from?: unknown; body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON illisible." }, { status: 400 });
  }

  const sender = typeof payload.from === "string" ? payload.from.slice(0, 64) : null;
  const body = typeof payload.body === "string" ? payload.body.slice(0, 2000) : "";

  if (!body.trim()) {
    return NextResponse.json({ error: "SMS vide." }, { status: 400 });
  }

  if (!isTrustedSender(sender, process.env.MOMO_SMS_SENDERS ?? "")) {
    return NextResponse.json({ outcome: "ignored", reason: "sender" });
  }

  // A merchant SIM also receives debit and balance messages; settling on those
  // would mark bookings paid as money leaves the account.
  if (!looksLikeCredit(body)) {
    return NextResponse.json({ outcome: "ignored", reason: "not_a_credit" });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY absent sur ce déploiement." },
      { status: 503 }
    );
  }

  const parsed = parseSms(body);
  const smsHash = createHash("sha256").update(`${sender ?? ""}\n${body}`).digest("hex");

  const { data, error } = await supabase.rpc("settle_booking_from_sms", {
    p_sender: sender,
    p_body: body,
    p_sms_hash: smsHash,
    p_amount: parsed.amount,
    p_reference: parsed.reference,
    p_transaction_id: parsed.transactionId,
  });

  if (error) {
    // 500 so the relay retries: unlike a parse failure, this one may succeed.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = (data as { outcome: string; booking_id: string | null }[] | null)?.[0];

  return NextResponse.json({
    outcome: result?.outcome ?? "unmatched",
    bookingId: result?.booking_id ?? null,
    parsed,
  });
}
