"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rate-limit";
import { planFor } from "@/lib/subscriptions/plans";

export type SubscriptionState = { error?: string; ok?: boolean };

/**
 * Opens a Premium request, then sends the buyer to the payment instructions.
 *
 * The plan id comes from the form; the *price* never does — it is looked up
 * server-side from `plans.ts`. The row is created `pending_payment` and
 * inactive, which the INSERT policy also enforces, so nothing is granted here.
 */
export async function startSubscription(
  _previous: SubscriptionState,
  formData: FormData
): Promise<SubscriptionState> {
  const user = await requireUser();
  const locale = await getLocale();

  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }

  const plan = planFor(String(formData.get("plan") ?? ""));
  if (!plan) return { error: "Offre inconnue." };

  // Admins pass — they have no plan of their own but must be able to test the
  // flow — everyone else must match the plan's audience.
  if (user.role !== "admin" && user.role !== plan.role) {
    return {
      error:
        plan.role === "candidate"
          ? "Cette offre est réservée aux candidats."
          : "Cette offre est réservée aux employeurs.",
    };
  }

  const limit = rateLimit(`subscribe:${user.id}`, { limit: 5, windowSeconds: 600 });
  if (!limit.ok) return { error: tooManyRequestsMessage(limit.retryAfterSeconds) };

  const supabase = await createClient();

  // One open request at a time: a second would leave the admin with two rows
  // for the same payment and no way to tell which the transaction belongs to.
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("profile_id", user.profileId)
    .eq("status", "pending_payment")
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("subscriptions").insert({
      profile_id: user.profileId,
      plan_name: plan.name,
      price: plan.price,
    });

    if (error) return { error: `Demande impossible : ${error.message}` };
  }

  revalidatePath("/", "layout");
  return redirect({ href: "/premium", locale });
}

const declareSchema = z.object({
  subscriptionId: z.string().uuid("Abonnement inconnu."),
  reference: z
    .string()
    .trim()
    .min(4, "Saisissez l'identifiant de transaction reçu par SMS.")
    .max(64, "Cet identifiant est trop long."),
});

/** Records the transaction id. Does not activate anything: an admin still has
 *  to see the money on the MoMo statement. */
export async function declareSubscriptionPayment(
  _previous: SubscriptionState,
  formData: FormData
): Promise<SubscriptionState> {
  await requireUser();

  const parsed = declareSchema.safeParse({
    subscriptionId: formData.get("subscriptionId"),
    reference: formData.get("reference"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("declare_subscription_payment", {
    p_subscription_id: parsed.data.subscriptionId,
    p_reference: parsed.data.reference,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Admin settlement. The RPC re-checks the role and does the activation and the
 * `is_premium` flip in one statement, so the badge and the subscription behind
 * it can never disagree.
 */
export async function settleSubscription(subscriptionId: string, confirmed: boolean) {
  await requireUser({ role: "admin" });

  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_subscription", {
    p_subscription_id: subscriptionId,
    p_confirmed: confirmed,
    p_months: 1,
  });

  if (error) {
    throw new Error(`Impossible de mettre à jour l'abonnement : ${error.message}`);
  }

  revalidatePath("/", "layout");
}
