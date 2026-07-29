"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { normalisePhone } from "@/lib/phone";

export type ProfileFormState = { error?: string; ok?: boolean };

/**
 * Validated *and* rewritten to one canonical shape.
 *
 * The old rule only checked which characters were allowed, so "06" and
 * "0000000000000" both passed. A wrong number is worse than a missing one here:
 * it is the single channel an employer has to reach a candidate, and the typo
 * only surfaces when a placement fails.
 *
 * `transform` runs after validation, so what reaches the database is always
 * `+242 06 717 30 30` — two spellings of one number could not be compared, which
 * is how duplicate accounts and failed lookups start.
 */
const phone = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional()
  .superRefine((value, ctx) => {
    if (value === undefined) return;
    const result = normalisePhone(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.reason });
    }
  })
  .transform((value) => {
    if (value === undefined) return undefined;
    const result = normalisePhone(value);
    return result.ok ? result.value : value;
  });

const baseSchema = z.object({
  fullName: z.string().trim().min(2, "Indiquez votre nom complet."),
  phone,
  whatsapp: phone,
  neighborhoodId: z.string().uuid().optional(),
});

const candidateSchema = baseSchema.extend({
  jobTitle: z.string().trim().max(80).optional(),
  age: z.number().int().min(16, "Âge minimum : 16 ans.").max(80).optional(),
  gender: z.enum(["F", "M", ""]).optional(),
  experience: z.string().trim().max(120).optional(),
  desiredSalary: z.number().int().positive().max(10_000_000).optional(),
  availability: z.enum(["full_time", "part_time", "internal", "external", ""]).optional(),
  description: z.string().trim().max(2000, "Description trop longue.").optional(),
  languages: z.array(z.string()).max(12),
  skills: z.array(z.string()).max(20),
});

const employerSchema = baseSchema.extend({
  companyName: z.string().trim().max(120).optional(),
  address: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000, "Description trop longue.").optional(),
});

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}

function integer(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** "Cuisine, repassage, , garde d'enfants" → ["Cuisine","repassage","garde d'enfants"] */
function list(formData: FormData, key: string) {
  return String(formData.get(key) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Saves the signed-in user's own profile.
 *
 * Split by role rather than one permissive schema: a candidate and an employer
 * write to different detail tables, and letting either post the other's fields
 * would mean trusting a hidden input for something RLS cannot check.
 *
 * `role`, `is_validated` and `is_premium` are never written here — the
 * protect_profile_columns trigger would revert them anyway, but not sending
 * them keeps the intent explicit.
 */
export async function updateProfile(
  _previous: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const user = await requireUser();

  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }

  // `has` rather than a truthiness test: an absent field and an emptied one
  // must not be treated alike (see saveShared).
  const contactEditable = formData.has("phone");

  const shared = {
    fullName: formData.get("fullName"),
    phone: text(formData, "phone"),
    whatsapp: text(formData, "whatsapp"),
    neighborhoodId: text(formData, "neighborhoodId"),
  };

  const supabase = await createClient();

  if (user.role === "employer") {
    const parsed = employerSchema.safeParse({
      ...shared,
      companyName: text(formData, "companyName"),
      address: text(formData, "address"),
      description: text(formData, "description"),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
    }

    const profileError = await saveShared(supabase, user.profileId, parsed.data, contactEditable);
    if (profileError) return { error: profileError };

    // upsert, not update: the signup trigger creates this row, but a profile
    // that predates it — or whose trigger failed — would silently save nothing.
    const { error } = await supabase.from("employer_details").upsert(
      {
        profile_id: user.profileId,
        company_name: parsed.data.companyName ?? null,
        address: parsed.data.address ?? null,
        description: parsed.data.description ?? null,
      },
      { onConflict: "profile_id" }
    );

    if (error) return { error: `Enregistrement impossible : ${error.message}` };
  } else {
    const parsed = candidateSchema.safeParse({
      ...shared,
      jobTitle: text(formData, "jobTitle"),
      age: integer(formData, "age"),
      gender: String(formData.get("gender") ?? ""),
      experience: text(formData, "experience"),
      desiredSalary: integer(formData, "desiredSalary"),
      availability: String(formData.get("availability") ?? ""),
      description: text(formData, "description"),
      languages: list(formData, "languages"),
      skills: list(formData, "skills"),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
    }

    const profileError = await saveShared(supabase, user.profileId, parsed.data, contactEditable);
    if (profileError) return { error: profileError };

    const { error } = await supabase.from("candidate_details").upsert(
      {
        profile_id: user.profileId,
        job_title: parsed.data.jobTitle ?? null,
        age: parsed.data.age ?? null,
        gender: parsed.data.gender || null,
        experience: parsed.data.experience ?? null,
        desired_salary: parsed.data.desiredSalary ?? null,
        availability: parsed.data.availability || null,
        description: parsed.data.description ?? null,
        languages: parsed.data.languages,
        skills: parsed.data.skills,
      },
      { onConflict: "profile_id" }
    );

    if (error) return { error: `Enregistrement impossible : ${error.message}` };
  }

  // The name and avatar show up in the Navbar and in every listing.
  revalidatePath("/", "layout");
  return { ok: true };
}

type SharedFields = {
  fullName: string;
  phone?: string;
  whatsapp?: string;
  neighborhoodId?: string;
};

async function saveShared(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  data: SharedFields,
  /**
   * False when the page could not read the current numbers back (my_contact()
   * missing, i.e. the PII migration hasn't been applied yet). The form then
   * renders no contact inputs, and writing `null` from those absent fields
   * would erase a number the user never saw — so they are left untouched.
   */
  contactEditable: boolean
) {
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: data.fullName,
      neighborhood_id: data.neighborhoodId ?? null,
      ...(contactEditable
        ? { phone: data.phone ?? null, whatsapp: data.whatsapp ?? null }
        : {}),
    })
    .eq("id", profileId);

  return error ? `Enregistrement impossible : ${error.message}` : null;
}
