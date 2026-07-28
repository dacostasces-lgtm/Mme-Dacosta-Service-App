/**
 * Parsing of Mobile Money confirmation SMS.
 *
 * Pure functions, no I/O: the operators' wording changes without notice, so
 * this is the part that has to be easy to read, adjust and test in isolation.
 */

export type ParsedSms = {
  /** Whole units of XAF. Mobile Money has no minor unit here. */
  amount: number | null;
  /** The `MD-XXXXXX` booking reference the payer was asked to quote. */
  reference: string | null;
  /** Operator transaction id, kept for the record — never used for matching. */
  transactionId: string | null;
};

/** `MD-` followed by exactly six base-16-ish characters. */
const REFERENCE = /\bMD-([A-Z0-9]{6})\b/i;

/**
 * An amount followed by a currency marker. Thousands may be separated by a
 * space, a non-breaking space, a dot or a comma depending on the operator, so
 * separators are stripped rather than interpreted — XAF has no decimals, which
 * removes the usual ambiguity between a decimal comma and a thousands comma.
 */
const AMOUNT = /(\d[\d\s .,]*)\s*(?:F\s?CFA|FCFA|XAF|F\b)/i;

/**
 * Labelled operator transaction id.
 *
 * The label alternation is ordered longest-first so "ID transaction:" is
 * consumed whole rather than leaving "transaction" to be captured as the value.
 * The captured token must contain a digit — that alone rules out picking up a
 * stray word — and must not be the booking reference, which has its own field.
 */
const TRANSACTION_ID =
  /\b(?:id\s+(?:de\s+)?transaction|transaction\s*id|txn\s*id|tx\s*id|transaction|txn|r[ée]f(?:[ée]rence)?|ref|id)\b\s*[:#=]?\s*((?!MD-)(?=[A-Z0-9._\-/]*\d)[A-Z0-9][A-Z0-9._\-/]{4,63})\b/i;

/**
 * Credit wording. A merchant SIM also receives debit and balance SMS, and
 * settling on those would mark bookings paid when money leaves the account.
 */
const CREDIT =
  /\b(?:re[çc]u|recu|received|cr[ée]dit[ée]?|credited|paiement re[çc]u|encaiss[ée])\b/i;

export function looksLikeCredit(body: string) {
  return CREDIT.test(body);
}

export function parseAmount(body: string): number | null {
  // Read from the credit wording onwards rather than from the start of the
  // message. Several operators open with the previous balance ("Solde precedent
  // 1 000 F. Vous avez recu 5 000 FCFA"), and taking the first amount in the
  // text picked up that balance instead — settlement then failed as an
  // amount_mismatch and a perfectly good payment fell back to the manual queue.
  const credit = body.match(CREDIT);
  const fromCredit = credit?.index !== undefined ? body.slice(credit.index) : body;

  const match = fromCredit.match(AMOUNT) ?? body.match(AMOUNT);
  if (!match) return null;
  const digits = match[1].replace(/[\s .,]/g, "");
  if (!digits) return null;
  const amount = Number.parseInt(digits, 10);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function parseReference(body: string): string | null {
  const match = body.match(REFERENCE);
  return match ? `MD-${match[1].toUpperCase()}` : null;
}

export function parseTransactionId(body: string): string | null {
  const match = body.match(TRANSACTION_ID);
  return match ? match[1] : null;
}

export function parseSms(body: string): ParsedSms {
  return {
    amount: parseAmount(body),
    reference: parseReference(body),
    transactionId: parseTransactionId(body),
  };
}

/** Case, spaces and a leading `+` carry no meaning in a sender id, and vary
 *  between handsets: "+242 06…" and "24206…" are the same sender. */
function normaliseSender(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/^\+/, "");
}

/**
 * Senders whose messages are trusted, from `MOMO_SMS_SENDERS`.
 *
 * This is the *only* thing standing between the settlement and a forged SMS.
 * The shared secret guards the HTTP endpoint, but it does not guard the SMS:
 * the merchant number is printed on the payment screen for every employer to
 * see, so anyone can text that SIM, and the relay forwards whatever arrives.
 * A message reading "Vous avez recu 15000 FCFA MD-A1B2C3" from an ordinary
 * handset would otherwise settle a booking that was never paid.
 *
 * Two changes follow from that:
 *   - an empty list is rejected by the caller rather than meaning "allow all";
 *   - entries match the whole sender id, not a substring. `includes` meant an
 *     allow-list of "242" accepted every Congolese number, and "MTN" accepted
 *     a sender calling itself "FAKEMTN".
 */
export function isTrustedSender(sender: string | null, allowList: string) {
  const allowed = allowList
    .split(",")
    .map((entry) => normaliseSender(entry))
    .filter(Boolean);

  // Fail closed. The caller refuses the request outright in this case; the
  // guard is repeated here so the function is not a trap on its own.
  if (allowed.length === 0) return false;
  if (!sender) return false;

  const normalised = normaliseSender(sender);
  return allowed.some((entry) => normalised === entry);
}
