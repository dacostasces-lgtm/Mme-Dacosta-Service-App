"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rate-limit";

export type ApplicationState = { error?: string; ok?: boolean };

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

  revalidatePath("/", "layout");
  return { ok: true };
}
