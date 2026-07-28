"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * Publishes a profile, or takes it back off the listing.
 *
 * The buttons only render for admins, but a server action is a public endpoint:
 * the role is re-checked here, and the database keeps two further backstops —
 * the profiles UPDATE policy, and the `protect_profile_columns` trigger, which
 * silently reverts `is_validated` for anyone who isn't an admin.
 */
export async function setProfileValidation(profileId: string, validated: boolean) {
  await requireUser({ role: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_validated: validated })
    .eq("id", profileId);

  if (error) {
    throw new Error(`Impossible de mettre à jour le profil : ${error.message}`);
  }

  // The moderation queue and the public listing both change; revalidating the
  // layout covers every locale prefix without enumerating them.
  revalidatePath("/", "layout");
}

export type CandidateCheck = "identity" | "criminal_record" | "interview";

/**
 * Records — or withdraws — one of the three verifications shown on a candidate's
 * public profile. The database stamps which admin asserted it, so every claim
 * displayed to a family can be traced back to a person.
 */
export async function setCandidateCheck(
  profileId: string,
  check: CandidateCheck,
  checked: boolean
) {
  await requireUser({ role: "admin" });

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_candidate_check", {
    candidate_id: profileId,
    check_name: check,
    checked,
  });

  if (error) {
    throw new Error(`Impossible d'enregistrer la vérification : ${error.message}`);
  }

  revalidatePath("/", "layout");
}

/**
 * Settles — or rejects — a Mobile Money payment the employer declared.
 *
 * `confirmed` is the admin asserting they saw the amount land on the platform's
 * MoMo account. Rejecting clears the declaration so the employer can submit a
 * corrected reference rather than being stuck.
 */
export async function settleBookingPayment(bookingId: string, confirmed: boolean) {
  const admin = await requireUser({ role: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update(
      confirmed
        ? {
            status: "paid",
            payment_confirmed_at: new Date().toISOString(),
            payment_confirmed_by: admin.profileId,
          }
        : {
            payment_reference: null,
            payment_declared_at: null,
            payment_confirmed_at: null,
            payment_confirmed_by: null,
          }
    )
    .eq("id", bookingId)
    // Never re-settle something already paid: without this an admin could
    // stamp a second confirmation over a closed booking.
    .eq("status", "pending_payment");

  if (error) {
    throw new Error(`Impossible de mettre à jour le paiement : ${error.message}`);
  }

  revalidatePath("/", "layout");
}
