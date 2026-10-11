"use server";

import { INCOMPLETE_PROFILE_MESSAGE } from "@/lib/profile/completeness";
import { containsPhoneNumber, PHONE_NUMBER_REFUSED } from "@/lib/contact/phone-filter";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rate-limit";
import { APPLICATION_STATUSES } from "@/lib/applications/status";

export type ApplicationState = {
  error?: string;
  ok?: boolean;
  /** Refus pour profil incomplet : l'écran propose alors le lien vers le profil. */
  incompleteProfile?: boolean;
};

const schema = z.object({
  jobId: z.string().uuid("Offre inconnue."),
  message: z
    .string()
    .trim()
    .max(1000, "Message trop long (1000 caractères maximum).")
    .optional(),
});

/**
 * Applies the signed-in candidate to a job.
 *
 * `candidate_id` comes from the session, never from the form: the applications
 * INSERT policy checks the same thing, but sending it from the client would
 * mean the UI and the policy disagree on who is applying.
 */
export async function applyToJob(
  _previous: ApplicationState,
  formData: FormData
): Promise<ApplicationState> {
  const user = await requireUser({ role: "candidate" });

  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }

  // Un employeur reçoit le profil avec la candidature : incomplet, il ne lui
  // dit ni l'expérience ni les disponibilités, et parfois pas de numéro.
  if (user.missingProfileFields.length > 0) {
    return { error: INCOMPLETE_PROFILE_MESSAGE, incompleteProfile: true };
  }

  // The UNIQUE constraint stops a candidate applying twice to one posting, but
  // not to every posting in a loop.
  const limit = rateLimit(`apply:${user.id}`, { limit: 15, windowSeconds: 300 });
  if (!limit.ok) {
    return { error: tooManyRequestsMessage(limit.retryAfterSeconds) };
  }

  const parsed = schema.safeParse({
    jobId: formData.get("jobId"),
    message: String(formData.get("message") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Candidature invalide." };
  }

  if (containsPhoneNumber(parsed.data.message)) {
    return { error: PHONE_NUMBER_REFUSED };
  }

  const supabase = await createClient();

  // Closed and archived jobs are still readable by their employer, so the
  // status is checked rather than relying on the row simply being visible.
  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", parsed.data.jobId)
    .eq("status", "active")
    .maybeSingle();

  if (!job) {
    return { error: "Cette offre n'est plus ouverte aux candidatures." };
  }

  const { error } = await supabase.from("applications").insert({
    job_id: parsed.data.jobId,
    candidate_id: user.profileId,
    message: parsed.data.message ?? null,
  });

  if (error) {
    // 23505: the UNIQUE(job_id, candidate_id) guard. Applying twice is a
    // double-click or a stale page, not something to show a database error for.
    if (error.code === "23505") {
      return { error: "Vous avez déjà postulé à cette offre." };
    }
    return { error: `Envoi impossible : ${error.message}` };
  }

  // Les deux tableaux de bord et la liste des offres changent d'un coup. Assez
  // large pour remonter les composants clients de la page visitée : c'est
  // pourquoi ApplyButton porte lui-même son état « déjà postulé » au lieu de
  // laisser la page choisir entre lui et un paragraphe.
  revalidatePath("/", "layout");
  return { ok: true };
}

const statusSchema = z.object({
  applicationId: z.string().uuid(),
  status: z.enum(APPLICATION_STATUSES),
});

/**
 * L'employeur fait avancer une candidature reçue. Filtré sur ses propres
 * offres en plus de la RLS : un admin passe la politique de mise à jour, et ce
 * menu ne doit agir que sur les candidatures de l'appelant.
 *
 * Pas de `revalidatePath` : il bloquerait la réponse de l'action (voir
 * src/lib/bookings/actions.ts). Le menu rafraîchit la page lui-même.
 */
export async function setApplicationStatus(
  _previous: ApplicationState,
  formData: FormData
): Promise<ApplicationState> {
  const user = await requireUser({ role: "employer" });
  const parsed = statusSchema.safeParse({
    applicationId: formData.get("applicationId"),
    status: formData.get("status"),
  });
  if (!parsed.success || !user.profileId) return { error: "Candidature introuvable." };

  const supabase = await createClient();
  const { data: owned } = await supabase
    .from("applications")
    .select("id, jobs!inner(employer_id)")
    .eq("id", parsed.data.applicationId)
    .eq("jobs.employer_id", user.profileId)
    .maybeSingle();
  if (!owned) return { error: "Candidature introuvable." };

  const { error } = await supabase
    .from("applications")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.applicationId);
  if (error) return { error: `Mise à jour impossible : ${error.message}` };

  return { ok: true };
}
