"use server";

import { INCOMPLETE_PROFILE_MESSAGE } from "@/lib/profile/completeness";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rate-limit";

export type UnlockState = { error?: string; ok?: boolean; incompleteProfile?: boolean };

const jobId = z.string().uuid();

/**
 * Ouvre une demande de déblocage. Rien n'est accordé ici : le prix est fixé
 * en base et la ligne naît « en attente de paiement ».
 *
 * Pas de `revalidatePath` : appelé depuis la page de l'offre, il bloquerait la
 * réponse (voir src/lib/bookings/actions.ts). Le composant rafraîchit la page.
 */
export async function requestContactUnlock(
  _previous: UnlockState,
  formData: FormData
): Promise<UnlockState> {
  const user = await requireUser({ role: "candidate" });

  const parsed = jobId.safeParse(formData.get("jobId"));
  if (!parsed.success) return { error: "Offre introuvable." };

  if (user.missingProfileFields.length > 0) {
    return { error: INCOMPLETE_PROFILE_MESSAGE, incompleteProfile: true };
  }

  const limit = rateLimit(`unlock:${user.id}`, { limit: 10, windowSeconds: 600 });
  if (!limit.ok) return { error: tooManyRequestsMessage(limit.retryAfterSeconds) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_contact_unlock", { p_job_id: parsed.data });
  if (error) return { error: error.message };

  return { ok: true };
}

const declareSchema = z.object({
  unlockId: z.string().uuid("Déblocage inconnu."),
  reference: z
    .string()
    .trim()
    .min(4, "Saisissez l'identifiant de transaction reçu par SMS.")
    .max(64, "Cet identifiant est trop long."),
});

/** Enregistre l'identifiant de transaction. N'ouvre rien : l'administration
 *  doit d'abord voir l'argent sur le relevé Mobile Money. */
export async function declareContactUnlockPayment(
  _previous: UnlockState,
  formData: FormData
): Promise<UnlockState> {
  await requireUser({ role: "candidate" });

  const parsed = declareSchema.safeParse({
    unlockId: formData.get("unlockId"),
    reference: formData.get("reference"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("declare_contact_unlock_payment", {
    p_unlock_id: parsed.data.unlockId,
    p_reference: parsed.data.reference,
  });
  if (error) return { error: error.message };

  return { ok: true };
}

/** Validation par l'administration, depuis la page de modération. */
export async function settleContactUnlock(unlockId: string, confirmed: boolean) {
  await requireUser({ role: "admin" });

  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_contact_unlock", {
    p_unlock_id: unlockId,
    p_confirmed: confirmed,
  });

  if (error) {
    throw new Error(`Impossible de mettre à jour le déblocage : ${error.message}`);
  }

  // Même usage que settleSubscription : un formulaire sans état côté client,
  // que seul ce rafraîchissement met à jour.
  revalidatePath("/", "layout");
}

// Le numéro d'un candidat, pour un employeur ----------------------------------
// Même circuit que ci-dessus, dans l'autre sens (20261011090000_candidate_contact.sql).

export type CandidateUnlockState = { error?: string; ok?: boolean; missingPhone?: boolean };

const candidateId = z.string().uuid();

/** « Payer pour avoir le numéro » : ouvre la demande, au prix fixé en base. */
export async function requestCandidateUnlock(
  _previous: CandidateUnlockState,
  formData: FormData
): Promise<CandidateUnlockState> {
  const user = await requireUser({ role: "employer" });

  const parsed = candidateId.safeParse(formData.get("candidateId"));
  if (!parsed.success) return { error: "Profil introuvable." };

  // La règle de la publication d'une offre (src/lib/jobs/actions.ts) : un
  // employeur sans numéro ne peut pas obtenir celui d'un candidat.
  if (user.role !== "admin" && !user.hasPhone) {
    return {
      error: "Ajoutez d'abord votre numéro de téléphone dans votre profil.",
      missingPhone: true,
    };
  }

  const limit = rateLimit(`candidate-unlock:${user.id}`, { limit: 10, windowSeconds: 600 });
  if (!limit.ok) return { error: tooManyRequestsMessage(limit.retryAfterSeconds) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_candidate_unlock", {
    p_candidate_id: parsed.data,
  });
  if (error) return { error: error.message };

  return { ok: true };
}

export async function declareCandidateUnlockPayment(
  _previous: CandidateUnlockState,
  formData: FormData
): Promise<CandidateUnlockState> {
  await requireUser({ role: "employer" });

  const parsed = declareSchema.safeParse({
    unlockId: formData.get("unlockId"),
    reference: formData.get("reference"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("declare_candidate_unlock_payment", {
    p_unlock_id: parsed.data.unlockId,
    p_reference: parsed.data.reference,
  });
  if (error) return { error: error.message };

  return { ok: true };
}

export async function settleCandidateUnlock(unlockId: string, confirmed: boolean) {
  await requireUser({ role: "admin" });

  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_candidate_unlock", {
    p_unlock_id: unlockId,
    p_confirmed: confirmed,
  });

  if (error) {
    throw new Error(`Impossible de mettre à jour le déblocage : ${error.message}`);
  }

  revalidatePath("/", "layout");
}
