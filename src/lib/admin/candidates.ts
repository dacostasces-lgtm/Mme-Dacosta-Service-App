"use server";

import { randomBytes } from "node:crypto";
import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalisePhone } from "@/lib/phone";
import { AVAILABILITY_VALUES } from "@/lib/candidates/availability";

const schema = z.object({
  fullName: z.string().trim().min(2, "Indiquez le nom du candidat."),
  phone: z.string().trim().min(1, "Le numéro est obligatoire."),
  email: z.string().trim().email("Adresse invalide.").optional().or(z.literal("")),
  neighborhoodId: z.string().uuid("Choisissez un quartier."),
  jobTitle: z.string().trim().min(2, "Indiquez le métier."),
  experience: z.string().trim().max(60).optional(),
  availability: z.enum(AVAILABILITY_VALUES).optional(),
  desiredSalary: z.coerce.number().int().min(0).max(100_000_000).optional(),
  languages: z.string().trim().max(200).optional(),
  skills: z.string().trim().max(400).optional(),
  description: z.string().trim().max(2000).optional(),
});

export type NewCandidateState = {
  error?: string;
  /** Renseigné au succès, pour proposer le lien vers la fiche publique. */
  profileId?: string;
  fullName?: string;
};

/** « Français, lingala » -> ["Français", "lingala"]. Les vides disparaissent. */
function toList(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Crée un profil candidat complet à la place du candidat.
 *
 * Beaucoup de personnes que Madame Dacosta rencontre ne s'inscriront jamais
 * seules : la fiche est saisie par la modération, à partir d'un entretien.
 *
 * `profiles.user_id` est NOT NULL et référence `auth.users` : un profil sans
 * compte est impossible, on en crée donc un vrai, identifié par le numéro.
 * Le candidat le réclame plus tard par « mot de passe oublié » et reçoit un
 * code SMS — d'où l'absence de mot de passe à lui transmettre, et le numéro
 * laissé **non confirmé** : c'est précisément cette reprise qui prouve qu'il
 * possède la ligne.
 */
export async function createCandidate(
  _prev: NewCandidateState,
  formData: FormData
): Promise<NewCandidateState> {
  await requireUser({ role: "admin" });

  const parsed = schema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: formData.get("email") ?? "",
    neighborhoodId: formData.get("neighborhoodId"),
    jobTitle: formData.get("jobTitle"),
    experience: formData.get("experience") ?? undefined,
    availability: formData.get("availability") || undefined,
    desiredSalary: formData.get("desiredSalary") || undefined,
    languages: formData.get("languages") ?? undefined,
    skills: formData.get("skills") ?? undefined,
    description: formData.get("description") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }

  const phone = normalisePhone(parsed.data.phone);
  if (!phone.ok) {
    return { error: "Numéro invalide. Format attendu : 06 717 30 30." };
  }
  const e164 = `+${phone.value.replace(/\D/g, "")}`;

  // Service role : créer un utilisateur et écrire `is_validated` sont deux
  // choses qu'aucune clé publique ne doit pouvoir faire.
  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY absente sur ce déploiement : impossible de créer un compte.",
    };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    phone: e164,
    ...(parsed.data.email ? { email: parsed.data.email } : {}),
    // Jamais communiqué : le candidat passe par la récupération SMS. Le générer
    // plutôt que de le laisser vide évite un compte sans facteur d'authentification.
    password: randomBytes(24).toString("base64url"),
    // Le déclencheur handle_new_user lit ces clés pour bâtir le profil et
    // rattacher le quartier ; les réécrire ensuite dupliquerait sa logique.
    user_metadata: {
      role: "candidate",
      full_name: parsed.data.fullName,
      phone: phone.value,
      neighborhood_id: parsed.data.neighborhoodId,
    },
  });

  if (createError || !created.user) {
    const message = createError?.message ?? "Création impossible.";
    // Le cas de loin le plus fréquent, et le message brut de Supabase
    // ("User already registered") ne dit pas lequel des deux est en cause.
    if (/already|exist|registered|duplicate/i.test(message)) {
      return { error: "Un compte existe déjà avec ce numéro ou cette adresse." };
    }
    return { error: `Création impossible : ${message}` };
  }

  const userId = created.user.id;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    // Le compte existe mais le déclencheur n'a rien écrit : le laisser en place
    // bloquerait le numéro sans rien afficher, et une reprise buterait sur
    // « compte déjà existant » sans profil à montrer.
    await admin.auth.admin.deleteUser(userId);
    return {
      error:
        "Le compte a été créé mais le profil ne s'est pas écrit ; rien n'a été conservé. Réessayez.",
    };
  }

  const photo = formData.get("photo");
  let avatarUrl: string | null = null;

  if (photo instanceof File && photo.size > 0) {
    // Même convention que les envois du candidat : <auth.uid()>/<fichier>.
    const extension = (photo.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
    const objectPath = `${userId}/avatar.${extension}`;
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(objectPath, photo, { upsert: true, contentType: photo.type });

    if (!uploadError) {
      const {
        data: { publicUrl },
      } = admin.storage.from("avatars").getPublicUrl(objectPath);
      avatarUrl = `${publicUrl}?v=${Date.now()}`;
    }
    // Un envoi de photo qui échoue ne doit pas perdre la fiche : elle est
    // rattrapable depuis l'écran de modification, la saisie ne l'est pas.
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      // Publié d'emblée : la modération, c'est la personne qui saisit.
      is_validated: true,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq("id", profile.id);

  if (updateError) {
    return { error: `Profil créé mais non publié : ${updateError.message}` };
  }

  const { error: detailsError } = await admin
    .from("candidate_details")
    .update({
      job_title: parsed.data.jobTitle,
      experience: parsed.data.experience || null,
      availability: parsed.data.availability ?? null,
      desired_salary: parsed.data.desiredSalary ?? null,
      languages: toList(parsed.data.languages),
      skills: toList(parsed.data.skills),
      description: parsed.data.description || null,
    })
    .eq("profile_id", profile.id);

  if (detailsError) {
    return { error: `Profil publié mais incomplet : ${detailsError.message}` };
  }

  // Pas de `revalidatePath` ici : mesuré sur ce dépôt, un appel depuis une
  // action rendue dans la page courante empêche sa réponse d'atteindre le
  // client — l'action aboutit côté serveur, mais le bouton reste figé sur
  // « en cours ». La recherche et la file de modération lisent la session,
  // donc se rendent à la demande et verront la fiche à la visite suivante.
  return { profileId: profile.id, fullName: parsed.data.fullName };
}
