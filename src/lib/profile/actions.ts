"use server";

import { isMissingTable, missingCandidateFields, isMissingFunction } from "@/lib/profile/completeness";
import { containsPhoneNumber, PHONE_NUMBER_REFUSED } from "@/lib/contact/phone-filter";
import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { normalisePhone } from "@/lib/phone";
import {
  MARITAL_STATUS_VALUES,
  MAX_CHILDREN_OPTION,
  MAX_CHILD_AGE_OPTION,
} from "@/lib/candidates/family";
import { MAX_SKILL_LENGTH, SKILL_TOO_LONG } from "@/lib/candidates/skills";
import {
  SCHEDULE_ORDER_MESSAGE,
  readSchedule,
  scheduleColumns,
  scheduleOrderValid,
  scheduleShape,
} from "@/lib/jobs/schedule-form";

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
  address: z
    .string()
    .trim()
    .min(3, "Adresse trop courte : indiquez la rue, le numéro ou un repère.")
    .max(200, "Adresse trop longue (200 caractères maximum).")
    .optional(),
  jobTitle: z.string().trim().max(80).optional(),
  age: z.number().int().min(16, "Âge minimum : 16 ans.").max(80).optional(),
  gender: z.enum(["F", "M", ""]).optional(),
  maritalStatus: z.enum(MARITAL_STATUS_VALUES).optional(),
  childrenCount: z.number().int().min(0).max(MAX_CHILDREN_OPTION).optional(),
  youngestChildAge: z.number().int().min(0).max(MAX_CHILD_AGE_OPTION).optional(),
  experience: z.string().trim().max(120).optional(),
  desiredSalary: z.number().int().positive().max(10_000_000).optional(),
  availability: z.enum(["full_time", "part_time", "internal", "external", ""]).optional(),
  description: z.string().trim().max(2000, "Description trop longue.").optional(),
  languages: z.array(z.string()).max(12),
  // Une phrase dans la case finissait découpée à chaque virgule sur la fiche.
  skills: z.array(z.string().max(MAX_SKILL_LENGTH, SKILL_TOO_LONG)).max(30),
  ...scheduleShape,
}).refine(scheduleOrderValid, { message: SCHEDULE_ORDER_MESSAGE });

const employerSchema = baseSchema.extend({
  companyName: z.string().trim().max(120).optional(),
  address: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000, "Description trop longue.").optional(),
});

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}

/** Un entier positif ou nul (0 enfant est une réponse, pas une case vide). */
function wholeNumber(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
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
    // 30 : toute la liste des compétences (21) plus quelques « Autre ».
    .slice(0, 30);
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

    if (containsPhoneNumber(parsed.data.description) || containsPhoneNumber(parsed.data.companyName)) {
      return { error: PHONE_NUMBER_REFUSED };
    }

    // Le téléphone de l'employeur est obligatoire, comme celui du candidat.
    // Champ absent du formulaire (my_contact() manquante) : on se fie au
    // numéro déjà enregistré plutôt que de bloquer pour rien.
    if (!(contactEditable ? parsed.data.phone : user.hasPhone)) {
      return { error: "Le numéro de téléphone est obligatoire." };
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
    // Champ absent quand la page n'a pas pu lire la table des adresses
    // (migration pas encore passée) : il n'est alors ni exigé ni écrit.
    const addressEditable = formData.has("address");
    // Même règle pour la situation familiale (20261022000000).
    const familyEditable = formData.has("maritalStatus");
    const childrenCount = wholeNumber(formData, "childrenCount");

    const parsed = candidateSchema.safeParse({
      ...shared,
      address: text(formData, "address"),
      jobTitle: text(formData, "jobTitle"),
      age: integer(formData, "age"),
      gender: String(formData.get("gender") ?? ""),
      maritalStatus: text(formData, "maritalStatus"),
      childrenCount,
      // Sans enfant, la case est masquée et sa valeur ignorée.
      youngestChildAge: childrenCount ? wholeNumber(formData, "youngestChildAge") : undefined,
      experience: text(formData, "experience"),
      desiredSalary: integer(formData, "desiredSalary"),
      availability: String(formData.get("availability") ?? ""),
      description: text(formData, "description"),
      languages: list(formData, "languages"),
      skills: list(formData, "skills"),
      ...readSchedule(formData),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
    }

    // Toutes les cases, sans quoi le profil ne s'enregistre pas. L'admin en
    // est exempté : il complète parfois une fiche en plusieurs fois.
    if (user.role !== "admin") {
      const missing = missingCandidateFields({
        // Champ absent du formulaire (fonction my_contact() manquante) : on se
        // fie au numéro déjà enregistré plutôt que de bloquer pour rien.
        phonePresent: contactEditable ? Boolean(parsed.data.phone) : user.hasPhone,
        neighborhoodId: parsed.data.neighborhoodId,
        address: addressEditable ? parsed.data.address : "?",
        jobTitle: parsed.data.jobTitle,
        experience: parsed.data.experience,
        age: parsed.data.age,
        gender: parsed.data.gender,
        maritalStatus: familyEditable ? parsed.data.maritalStatus : "?",
        childrenCount: familyEditable ? parsed.data.childrenCount : "?",
        youngestChildAge: familyEditable ? parsed.data.youngestChildAge : "?",
        availability: parsed.data.availability,
        desiredSalary: parsed.data.desiredSalary,
        skills: parsed.data.skills,
        languages: parsed.data.languages,
        workDays: parsed.data.workDays,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
      });
      if (missing.length > 0) {
        return {
          error: `Toutes les cases doivent être remplies pour enregistrer votre profil. Il manque : ${missing.join(", ")}.`,
        };
      }
    }

    // Les numéros ont leur champ à eux, plus haut, qui reste privé. Dans la
    // présentation, ils seraient publics.
    if (
      user.role !== "admin" &&
      (containsPhoneNumber(parsed.data.description) || containsPhoneNumber(parsed.data.jobTitle))
    ) {
      return { error: PHONE_NUMBER_REFUSED };
    }

    const profileError = await saveShared(supabase, user.profileId, parsed.data, contactEditable);
    if (profileError) return { error: profileError };

    // Par la fonction, pas par un `upsert` : `INSERT … ON CONFLICT DO UPDATE`
    // réclame le SELECT sur toute la table, que 20261017110000 a retiré pour
    // fermer la lecture directe de l'âge et du sexe. La fonction fait l'UPDATE
    // puis l'INSERT si besoin, et reste en `SECURITY INVOKER` : RLS et le
    // filtre anti-numéros s'appliquent comme avant (20261017140000).
    const schedule = scheduleColumns(parsed.data);
    const { error } = await supabase.rpc("save_my_candidate_details", {
      p_job_title: parsed.data.jobTitle ?? null,
      p_age: parsed.data.age ?? null,
      p_gender: parsed.data.gender || null,
      p_experience: parsed.data.experience ?? null,
      p_desired_salary: parsed.data.desiredSalary ?? null,
      p_availability: parsed.data.availability || null,
      // Pas de `description` : le champ a été retiré du profil candidat, et
      // l'écrire ici effacerait à chaque enregistrement celles déjà saisies.
      p_languages: parsed.data.languages,
      p_skills: parsed.data.skills,
      p_work_days: schedule.work_days,
      p_start_time: schedule.start_time,
      p_end_time: schedule.end_time,
      p_live_in: schedule.live_in,
    });

    if (error) return { error: `Enregistrement impossible : ${error.message}` };

    // La situation familiale, par sa propre fonction : save_my_candidate_details
    // garde sa signature, que l'application déjà en ligne appelle encore pendant
    // le passage de la migration. Fonction absente (migration pas encore
    // passée) : rien à écrire, le reste du profil est enregistré.
    if (familyEditable) {
      const { error: familyError } = await supabase.rpc("save_my_family_situation", {
        p_marital_status: parsed.data.maritalStatus ?? null,
        p_children_count: parsed.data.childrenCount ?? null,
        p_youngest_child_age: parsed.data.childrenCount ? (parsed.data.youngestChildAge ?? null) : null,
      });
      if (familyError && !isMissingFunction(familyError)) {
        return { error: `Situation familiale non enregistrée : ${familyError.message}` };
      }
    }

    // L'adresse vit à part, lisible du seul candidat et de l'administration
    // (20261012000000_candidate_address.sql).
    if (addressEditable && parsed.data.address) {
      const { error: addressError } = await supabase.from("candidate_addresses").upsert(
        {
          profile_id: user.profileId,
          address: parsed.data.address,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );
      if (addressError && !isMissingTable(addressError)) {
        return { error: `Adresse non enregistrée : ${addressError.message}` };
      }
    }
  }

  // Pas de `revalidatePath` : appelé depuis la page du profil, il empêchait
  // par moments la réponse d'atteindre le navigateur, et le bouton restait figé
  // sur « Enregistrement... » (mesuré en CI, voir src/lib/bookings/actions.ts).
  // Le formulaire rafraîchit lui-même la page une fois le résultat reçu, ce
  // qui remet à jour le nom dans la barre de navigation.
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
