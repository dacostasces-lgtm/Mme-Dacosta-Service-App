"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    title: z.string().trim().min(3, "Le titre doit faire au moins 3 caractères."),
    description: z.string().trim().min(20, "Décrivez le poste en au moins 20 caractères."),
    salaryMin: z.number().int().positive().optional(),
    salaryMax: z.number().int().positive().optional(),
    neighborhoodId: z.string().uuid().optional(),
  })
  .refine((data) => !data.salaryMin || !data.salaryMax || data.salaryMax >= data.salaryMin, {
    message: "Le salaire maximum doit être supérieur au minimum.",
  });

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

  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    salaryMin: optionalInt(formData.get("salaryMin")),
    salaryMax: optionalInt(formData.get("salaryMax")),
    neighborhoodId: String(formData.get("neighborhoodId") ?? "") || undefined,
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
  });

  if (error) {
    return { error: `Publication impossible : ${error.message}` };
  }

  revalidatePath("/", "layout");
  // Returned, not just called: `redirect` throws, but next-intl's inferred types
  // don't advertise `never`, so this is what ends the control flow for TS.
  return redirect({ href: "/offres", locale });
}
