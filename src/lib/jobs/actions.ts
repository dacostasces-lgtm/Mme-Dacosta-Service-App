"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rate-limit";
import { WORK_DAYS, sortWorkDays } from "@/lib/jobs/schedule";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = z
  .object({
    title: z.string().trim().min(3, "Le titre doit faire au moins 3 caractères."),
    description: z.string().trim().min(20, "Décrivez le poste en au moins 20 caractères."),
    salaryMin: z.number().int().positive().optional(),
    salaryMax: z.number().int().positive().optional(),
    neighborhoodId: z.string().uuid().optional(),
    workDays: z.array(z.enum(WORK_DAYS)),
    startTime: z.string().regex(TIME, "Heure de début invalide.").optional(),
    endTime: z.string().regex(TIME, "Heure de fin invalide.").optional(),
    liveIn: z.boolean(),
  })
  .refine((data) => !data.salaryMin || !data.salaryMax || data.salaryMax >= data.salaryMin, {
    message: "Le salaire maximum doit être supérieur au minimum.",
  })
  // Une fin avant le début n'est admise que si l'employé dort sur place : c'est
  // alors un service de nuit (20h – 7h). Sans logement, c'est une inversion.
  .refine(
    (data) =>
      data.liveIn || !data.startTime || !data.endTime || data.endTime > data.startTime,
    { message: "L'heure de fin doit être après l'heure de début." }
  );

export type JobFormState = { error?: string };

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

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
    workDays: sortWorkDays(formData.getAll("workDays").map(String)),
    startTime: optionalText(formData.get("startTime")),
    endTime: optionalText(formData.get("endTime")),
    liveIn: formData.get("liveIn") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  // The signup trigger creates a profile for every user, but a row could be
  // missing if that ever failed — without it the insert would violate the RLS
  // check with a confusing message.
  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("jobs").insert({
    employer_id: user.profileId,
    title: parsed.data.title,
    description: parsed.data.description,
    salary_range_min: parsed.data.salaryMin ?? null,
    salary_range_max: parsed.data.salaryMax ?? null,
    neighborhood_id: parsed.data.neighborhoodId ?? null,
    work_days: parsed.data.workDays,
    start_time: parsed.data.startTime ?? null,
    end_time: parsed.data.endTime ?? null,
    live_in: parsed.data.liveIn,
  });

  if (error) {
    return { error: `Publication impossible : ${error.message}` };
  }

  revalidatePath("/", "layout");
  // Returned, not just called: `redirect` throws, but next-intl's inferred types
  // don't advertise `never`, so this is what ends the control flow for TS.
  return redirect({ href: "/offres", locale });
}
