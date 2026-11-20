import "server-only";

import * as z from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingFunction, isMissingTable } from "@/lib/profile/completeness";
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

/**
 * Les cases du profil candidat : leur lecture, leur contrôle et leur
 * enregistrement, partagés par le profil (updateProfile) et par l'inscription
 * (registerAccount). Deux copies auraient fini par diverger — une case ajoutée
 * à l'une, oubliée dans l'autre, et c'est l'inscription incomplète qui revient.
 */

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
export const phone = z
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

export const baseSchema = z.object({
  fullName: z.string().trim().min(2, "Indiquez votre nom complet."),
  phone,
  whatsapp: phone,
  neighborhoodId: z.string().uuid().optional(),
});

export const candidateSchema = baseSchema
  .extend({
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
  })
  .refine(scheduleOrderValid, { message: SCHEDULE_ORDER_MESSAGE });

export type CandidateData = z.infer<typeof candidateSchema>;

export function text(formData: FormData, key: string) {
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

/** Les cases propres au candidat, telles que le formulaire les envoie, prêtes
 *  pour `candidateSchema` (à compléter des cases communes). */
export function readCandidateFields(formData: FormData) {
  const childrenCount = wholeNumber(formData, "childrenCount");
  return {
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
  };
}

/**
 * Écrit les détails du candidat, sa situation familiale et son adresse, avec
 * la session du candidat lui-même : RLS et le filtre anti-numéros
 * s'appliquent comme à un enregistrement du profil.
 *
 * Renvoie le message d'erreur à afficher, ou null.
 */
export async function writeCandidateDetails(
  supabase: SupabaseClient,
  profileId: string,
  data: CandidateData,
  {
    addressEditable,
    familyEditable,
  }: {
    /** Faux quand la table des adresses n'est pas lisible (migration pas encore passée). */
    addressEditable: boolean;
    /** Même règle pour la situation familiale (20261022000000). */
    familyEditable: boolean;
  }
): Promise<string | null> {
  // Par la fonction, pas par un `upsert` : `INSERT … ON CONFLICT DO UPDATE`
  // réclame le SELECT sur toute la table, que 20261017110000 a retiré pour
  // fermer la lecture directe de l'âge et du sexe. La fonction fait l'UPDATE
  // puis l'INSERT si besoin, et reste en `SECURITY INVOKER` : RLS et le
  // filtre anti-numéros s'appliquent comme avant (20261017140000).
  const schedule = scheduleColumns(data);
  const { error } = await supabase.rpc("save_my_candidate_details", {
    p_job_title: data.jobTitle ?? null,
    p_age: data.age ?? null,
    p_gender: data.gender || null,
    p_experience: data.experience ?? null,
    p_desired_salary: data.desiredSalary ?? null,
    p_availability: data.availability || null,
    // Pas de `description` : le champ a été retiré du profil candidat, et
    // l'écrire ici effacerait à chaque enregistrement celles déjà saisies.
    p_languages: data.languages,
    p_skills: data.skills,
    p_work_days: schedule.work_days,
    p_start_time: schedule.start_time,
    p_end_time: schedule.end_time,
    p_live_in: schedule.live_in,
  });

  if (error) return `Enregistrement impossible : ${error.message}`;

  // La situation familiale, par sa propre fonction : save_my_candidate_details
  // garde sa signature, que l'application déjà en ligne appelle encore pendant
  // le passage de la migration. Fonction absente (migration pas encore
  // passée) : rien à écrire, le reste du profil est enregistré.
  if (familyEditable) {
    const { error: familyError } = await supabase.rpc("save_my_family_situation", {
      p_marital_status: data.maritalStatus ?? null,
      p_children_count: data.childrenCount ?? null,
      p_youngest_child_age: data.childrenCount ? (data.youngestChildAge ?? null) : null,
    });
    if (familyError && !isMissingFunction(familyError)) {
      return `Situation familiale non enregistrée : ${familyError.message}`;
    }
  }

  // L'adresse vit à part, lisible du seul candidat et de l'administration
  // (20261012000000_candidate_address.sql).
  if (addressEditable && data.address) {
    const { error: addressError } = await supabase.from("candidate_addresses").upsert(
      {
        profile_id: profileId,
        address: data.address,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" }
    );
    if (addressError && !isMissingTable(addressError)) {
      return `Adresse non enregistrée : ${addressError.message}`;
    }
  }

  return null;
}
