"use server";

import { containsPhoneNumber, PHONE_NUMBER_REFUSED } from "@/lib/contact/phone-filter";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rate-limit";
import {
  SCHEDULE_ORDER_MESSAGE,
  readSchedule,
  scheduleColumns,
  scheduleOrderValid,
  scheduleShape,
} from "@/lib/jobs/schedule-form";
import { renewedExpiry } from "@/lib/jobs/expiry";

const schema = z
  .object({
    title: z.string().trim().min(3, "Le titre doit faire au moins 3 caractères."),
    description: z.string().trim().min(20, "Décrivez le poste en au moins 20 caractères."),
    salaryMin: z.number().int().positive().optional(),
    salaryMax: z.number().int().positive().optional(),
    neighborhoodId: z.string().uuid().optional(),
    ...scheduleShape,
  })
  .refine((data) => !data.salaryMin || !data.salaryMax || data.salaryMax >= data.salaryMin, {
    message: "Le salaire maximum doit être supérieur au minimum.",
  })
  .refine(scheduleOrderValid, { message: SCHEDULE_ORDER_MESSAGE });

export type JobFormState = { error?: string };

function optionalInt(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function createJob(
  _previous: JobFormState,
  formData: FormData
): Promise<JobFormState> {
  const user = await requireUser({ role: "employer" });
  const locale = await getLocale();

  // Job postings are the public face of the platform; a loop here would fill
  // the listing with spam faster than moderation could clear it.
  const limit = rateLimit(`job:${user.id}`, { limit: 10, windowSeconds: 3600 });
  if (!limit.ok) {
    return { error: tooManyRequestsMessage(limit.retryAfterSeconds) };
  }

  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    salaryMin: optionalInt(formData.get("salaryMin")),
    salaryMax: optionalInt(formData.get("salaryMax")),
    neighborhoodId: String(formData.get("neighborhoodId") ?? "") || undefined,
    ...readSchedule(formData),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  if (
    user.role !== "admin" &&
    (containsPhoneNumber(parsed.data.title) || containsPhoneNumber(parsed.data.description))
  ) {
    return { error: PHONE_NUMBER_REFUSED };
  }

  // The signup trigger creates a profile for every user, but a row could be
  // missing if that ever failed — without it the insert would violate the RLS
  // check with a confusing message.
  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }

  // « gratuite » ou « payante » : le prix, lui, est fixé en base.
  const paid = formData.get("formule") === "payante";

  const supabase = await createClient();
  const { data: created, error } = await supabase.from("jobs").insert({
    employer_id: user.profileId,
    title: parsed.data.title,
    description: parsed.data.description,
    salary_range_min: parsed.data.salaryMin ?? null,
    salary_range_max: parsed.data.salaryMax ?? null,
    neighborhood_id: parsed.data.neighborhoodId ?? null,
    ...scheduleColumns(parsed.data),
  }).select("id").single();

  if (error) {
    return { error: `Publication impossible : ${error.message}` };
  }

  revalidatePath("/", "layout");

  // L'offre est publiée dans tous les cas ; le paiement ne fait qu'ouvrir les
  // numéros des candidats. Une erreur ici renvoie quand même vers la page de
  // paiement, qui sait reproposer la demande.
  if (paid && created) {
    await supabase.rpc("request_job_payment", { p_job_id: created.id });
    return redirect({ href: `/offres/${created.id}/payer`, locale });
  }

  // Returned, not just called: `redirect` throws, but next-intl's inferred types
  // don't advertise `never`, so this is what ends the control flow for TS.
  return redirect({ href: "/offres", locale });
}

export type JobStatusState = { error?: string; ok?: boolean };

const jobId = z.string().uuid();

/**
 * « Toujours disponible » : repousse l'échéance de 15 jours à partir de
 * maintenant, et remet en ligne une offre déjà expirée.
 *
 * Pas de `revalidatePath` : appelé depuis l'action de la page courante, il
 * empêche la réponse d'atteindre le client (voir src/lib/bookings/actions.ts).
 * Le bouton rafraîchit la page lui-même une fois la réponse reçue.
 */
export async function renewJob(
  _previous: JobStatusState,
  formData: FormData
): Promise<JobStatusState> {
  const user = await requireUser({ role: "employer" });
  const parsed = jobId.safeParse(formData.get("jobId"));
  if (!parsed.success || !user.profileId) return { error: "Offre introuvable." };

  // Filtré sur l'employeur en plus de la RLS : un admin passe la politique de
  // mise à jour, et ce bouton ne doit agir que sur ses propres offres.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: "active", expires_at: renewedExpiry(), updated_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("employer_id", user.profileId)
    .select("id");

  if (error) return { error: `Prolongation impossible : ${error.message}` };
  if (!data?.length) return { error: "Offre introuvable." };
  return { ok: true };
}

/** « Poste pourvu » : retire l'offre, qui reste visible de son employeur. */
export async function closeJob(
  _previous: JobStatusState,
  formData: FormData
): Promise<JobStatusState> {
  const user = await requireUser({ role: "employer" });
  const parsed = jobId.safeParse(formData.get("jobId"));
  if (!parsed.success || !user.profileId) return { error: "Offre introuvable." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("employer_id", user.profileId)
    .select("id");

  if (error) return { error: `Fermeture impossible : ${error.message}` };
  if (!data?.length) return { error: "Offre introuvable." };
  return { ok: true };
}

/** « Passer en payante » pour une offre déjà publiée. */
export async function requestJobPayment(
  _previous: JobStatusState,
  formData: FormData
): Promise<JobStatusState> {
  await requireUser({ role: "employer" });
  const parsed = jobId.safeParse(formData.get("jobId"));
  if (!parsed.success) return { error: "Offre introuvable." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_job_payment", { p_job_id: parsed.data });
  if (error) return { error: error.message };
  return { ok: true };
}

const declareSchema = z.object({
  paymentId: z.string().uuid("Paiement inconnu."),
  reference: z
    .string()
    .trim()
    .min(4, "Saisissez l'identifiant de transaction reçu par SMS.")
    .max(64, "Cet identifiant est trop long."),
});

/** Enregistre l'identifiant de transaction ; l'administration valide ensuite. */
export async function declareJobPayment(
  _previous: JobStatusState,
  formData: FormData
): Promise<JobStatusState> {
  await requireUser({ role: "employer" });

  const parsed = declareSchema.safeParse({
    paymentId: formData.get("paymentId"),
    reference: formData.get("reference"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("declare_job_payment", {
    p_payment_id: parsed.data.paymentId,
    p_reference: parsed.data.reference,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

/** Validation par l'administration, depuis la page de modération. */
export async function settleJobPayment(paymentId: string, confirmed: boolean) {
  await requireUser({ role: "admin" });

  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_job_payment", {
    p_payment_id: paymentId,
    p_confirmed: confirmed,
  });
  if (error) {
    throw new Error(`Impossible de mettre à jour le paiement : ${error.message}`);
  }

  revalidatePath("/", "layout");
}
