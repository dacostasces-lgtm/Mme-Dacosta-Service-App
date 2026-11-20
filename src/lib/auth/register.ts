"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import * as z from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/server";
import { normalisePhone } from "@/lib/phone";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rate-limit";
import { consumeDurableLimit, consumeSmsBudget } from "@/lib/rate-limit-durable";
import { isOtpConfigured, sendPin, verifyPin } from "@/lib/otp/infobip";
import { rememberSkip } from "@/lib/otp/skip";
import { containsPhoneNumber, PHONE_NUMBER_REFUSED } from "@/lib/contact/phone-filter";
import { IDENTITY_TYPE_VALUES } from "@/lib/candidates/documents";
import {
  DOCUMENTS_NOT_CHECKED,
  isMissingTable,
  missingCandidateFields,
} from "@/lib/profile/completeness";
import {
  candidateSchema,
  readCandidateFields,
  text,
  writeCandidateDetails,
} from "@/lib/profile/candidate-form";

/**
 * Inscription en une fois : toutes les cases, puis le code reçu par SMS, puis
 * le compte.
 *
 * Avant, le compte naissait au premier clic, avec un nom et un mot de passe ;
 * le reste du profil venait — ou pas — ensuite. La modération recevait donc
 * des inscriptions sans métier, sans pièce, parfois sans numéro, qu'elle ne
 * pouvait ni publier ni relancer. Désormais le compte n'existe qu'une fois
 * tout rempli, et le numéro prouvé par le code.
 *
 * Quand le SMS ne part pas (crédit épuisé, fournisseur injoignable), le compte
 * est créé quand même, numéro non confirmé : l'équipe appelle la personne et
 * confirme depuis l'administration. Un SMS en panne ne doit fermer la porte à
 * personne.
 */

const COOKIE = "md-inscription";
/** Le temps de lire le SMS, de taper le code, et de corriger une case oubliée. */
const DUREE = 60 * 20;

export type SignupCodeState = {
  error?: string;
  /** Le SMS est parti : le code est attendu. */
  sent?: boolean;
  /** Le SMS n'a pas pu partir : le compte se créera sans code. */
  smsFailed?: boolean;
};

export type RegisterResult = {
  error?: string;
  ok?: boolean;
  /** Où aller une fois connecté. */
  next?: string;
};

/**
 * Ce que le cookie retient entre l'envoi du code et la création du compte :
 * le numéro, et l'identifiant de la demande chez Infobip — absent quand le SMS
 * n'a pas pu partir.
 *
 * Signé : sans signature, il suffirait d'écrire « pas de SMS » dans le cookie
 * pour s'inscrire sans code, ou d'y mettre la demande d'un autre numéro.
 */
type Pending = {
  phone: string;
  pinId: string | null;
  expiresAt: number;
  /** Code déjà accepté : un nouvel essai après une autre erreur ne le
   *  redemande pas (Infobip ne valide un code qu'une fois). */
  verified?: boolean;
};

function signingKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret ? createHmac("sha256", secret).update("md-inscription-v1").digest() : null;
}

function sign(payload: string, key: Buffer) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

async function writePending(pending: Pending) {
  const key = signingKey();
  if (!key) return false;
  const payload = Buffer.from(JSON.stringify(pending)).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload, key)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DUREE,
    path: "/",
  });
  return true;
}

async function readPending(): Promise<Pending | null> {
  const key = signingKey();
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!key || !raw) return null;

  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const pending = JSON.parse(Buffer.from(payload, "base64url").toString()) as Pending;
    if (typeof pending.phone !== "string" || pending.expiresAt < Date.now()) return null;
    return pending;
  } catch {
    return null;
  }
}

/** L'adresse d'où vient la demande, pour plafonner les envois par endroit. */
async function clientIp() {
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "inconnue";
}

const EXISTING_ACCOUNT =
  "Un compte existe déjà avec ce numéro. Connectez-vous, ou touchez « Mot de passe oublié ».";

/**
 * Envoie le code au numéro saisi, une fois le formulaire entièrement rempli.
 *
 * Rien n'est encore créé. Le numéro est d'abord comparé aux comptes existants :
 * inutile de payer un SMS pour une inscription qui échouera de toute façon.
 */
export async function sendSignupCode(phoneInput: string): Promise<SignupCodeState> {
  const parsed = normalisePhone(String(phoneInput ?? ""));
  if (!parsed.ok) return { error: parsed.reason };
  const phone = parsed.value;

  // Deux plafonds, en plus de celui d'Infobip par numéro : par numéro visé, et
  // par endroit, contre quelqu'un qui ferait défiler des numéros pour brûler
  // les crédits SMS.
  const perPhone = await consumeDurableLimit(`signup-sms:${phone}`, 4, 3600);
  if (!perPhone.ok) return { error: tooManyRequestsMessage(perPhone.retryAfterSeconds) };
  const perPlace = await consumeDurableLimit(`signup-sms-ip:${await clientIp()}`, 20, 3600);
  if (!perPlace.ok) return { error: tooManyRequestsMessage(perPlace.retryAfterSeconds) };

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Inscription indisponible pour le moment (SUPABASE_SERVICE_ROLE_KEY absente)." };
  }

  const { data: existing } = await admin.from("profiles").select("id").eq("phone", phone).limit(1);
  if ((existing ?? []).length > 0) return { error: EXISTING_ACCOUNT };

  const expiresAt = Date.now() + DUREE * 1000;
  const fallBack = async (): Promise<SignupCodeState> => {
    await writePending({ phone, pinId: null, expiresAt });
    return { smsFailed: true };
  };

  if (!isOtpConfigured()) return fallBack();

  // Le plafond du jour atteint, on n'envoie plus — mais on n'empêche pas de
  // s'inscrire : le numéro sera confirmé par appel.
  const budget = await consumeSmsBudget();
  if (!budget.ok) return fallBack();

  const sent = await sendPin(phone);
  if (!sent.ok) return fallBack();

  await writePending({ phone, pinId: sent.pinId, expiresAt });
  return { sent: true };
}

const sharedSchema = z.object({
  role: z.enum(["candidate", "employer"], { message: "Choisissez votre profil." }),
  fullName: z.string().trim().min(2, "Indiquez votre nom complet.").max(120),
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères.").max(72),
  neighborhoodId: z.string().uuid("Choisissez votre quartier."),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

function coordinate(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Crée le compte, une fois le code vérifié (ou le SMS en échec), et enregistre
 * tout le profil d'un coup.
 *
 * La session n'est pas posée ici : le navigateur se connecte lui-même ensuite,
 * avec le numéro et le mot de passe qu'il vient de saisir, puis dépose les
 * pièces d'identité dans le dossier du candidat. Poser les cookies depuis
 * cette action ferait redessiner la page d'inscription, qui renvoie tout
 * compte connecté vers son espace — au milieu de l'envoi des pièces.
 *
 * Si une écriture échoue, le compte est supprimé : mieux vaut recommencer
 * qu'un compte à moitié rempli, exactement ce que cette inscription supprime.
 */
export async function registerAccount(formData: FormData): Promise<RegisterResult> {
  const shared = sharedSchema.safeParse({
    role: text(formData, "role"),
    fullName: text(formData, "fullName") ?? "",
    password: String(formData.get("password") ?? ""),
    neighborhoodId: text(formData, "neighborhoodId"),
    lat: coordinate(formData, "lat"),
    lng: coordinate(formData, "lng"),
  });
  if (!shared.success) return { error: shared.error.issues[0]?.message ?? "Formulaire invalide." };

  const phoneParsed = normalisePhone(String(formData.get("phone") ?? ""));
  if (!phoneParsed.ok) return { error: phoneParsed.reason };
  const phone = phoneParsed.value;
  const e164 = `+${phone.replace(/\D/g, "")}`;
  const { role, fullName, password, neighborhoodId, lat, lng } = shared.data;

  if (containsPhoneNumber(fullName)) return { error: PHONE_NUMBER_REFUSED };

  // Les cases du candidat, vérifiées comme à l'enregistrement du profil : le
  // bouton grisé du navigateur n'est qu'un confort, c'est ici que la règle tient.
  let candidate: z.infer<typeof candidateSchema> | null = null;
  let identityType: string | null = null;
  if (role === "candidate") {
    const parsed = candidateSchema.safeParse({
      fullName,
      phone,
      neighborhoodId,
      ...readCandidateFields(formData),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
    }
    candidate = parsed.data;

    identityType = text(formData, "identityType") ?? null;
    if (!identityType || !(IDENTITY_TYPE_VALUES as readonly string[]).includes(identityType)) {
      return { error: "Choisissez le type de votre pièce d'identité." };
    }

    const missing = missingCandidateFields({
      phonePresent: true,
      neighborhoodId,
      address: candidate.address,
      jobTitle: candidate.jobTitle,
      experience: candidate.experience,
      age: candidate.age,
      gender: candidate.gender,
      maritalStatus: candidate.maritalStatus,
      childrenCount: candidate.childrenCount,
      youngestChildAge: candidate.youngestChildAge,
      availability: candidate.availability,
      desiredSalary: candidate.desiredSalary,
      skills: candidate.skills,
      languages: candidate.languages,
      workDays: candidate.workDays,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      // Les fichiers partent du navigateur juste après la création du compte,
      // dans le dossier du candidat : ils ne passent pas par cette action.
      ...DOCUMENTS_NOT_CHECKED,
    });
    if (missing.length > 0) {
      return { error: `Toutes les cases doivent être remplies. Il manque : ${missing.join(", ")}.` };
    }

    if (containsPhoneNumber(candidate.jobTitle)) return { error: PHONE_NUMBER_REFUSED };
  }

  // Le code : celui de la demande que ce navigateur a reçue, pour ce numéro.
  const pending = await readPending();
  if (!pending || pending.phone !== phone) {
    return { error: "Demandez d'abord votre code (le numéro a peut-être changé depuis)." };
  }

  let verifiedPinId: string | null = pending.pinId && pending.verified ? pending.pinId : null;
  if (pending.pinId && !pending.verified) {
    const limit = rateLimit(`signup-verify:${phone}`, { limit: 10, windowSeconds: 900 });
    if (!limit.ok) return { error: tooManyRequestsMessage(limit.retryAfterSeconds) };

    const code = String(formData.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(code)) return { error: "Le code compte six chiffres." };

    const result = await verifyPin(pending.pinId, code);
    if (!result.ok) return { error: result.error };
    verifiedPinId = pending.pinId;
    await writePending({ ...pending, verified: true });
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Inscription indisponible pour le moment (SUPABASE_SERVICE_ROLE_KEY absente)." };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    phone: e164,
    password,
    // Le numéro sert d'identifiant de connexion : Supabase n'envoie rien de
    // son côté, la preuve est notre code (ou l'appel de l'équipe).
    phone_confirm: true,
    // Le déclencheur handle_new_user bâtit le profil à partir de ces clés.
    user_metadata: {
      role,
      full_name: fullName,
      phone,
      neighborhood_id: neighborhoodId,
      ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    },
  });

  if (createError || !created.user) {
    const message = createError?.message ?? "Création impossible.";
    if (/already|exist|registered|duplicate/i.test(message)) return { error: EXISTING_ACCOUNT };
    return { error: `Création du compte impossible : ${message}` };
  }

  const userId = created.user.id;
  const undo = async (error: string): Promise<RegisterResult> => {
    // Suppression franche : le compte n'a jamais servi, et le numéro doit
    // redevenir libre pour un nouvel essai.
    await admin.auth.admin.deleteUser(userId);
    return { error };
  };

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) return undo("Le profil n'a pas pu être créé. Réessayez dans un instant.");
  const profileId = profile.id as string;

  if (candidate) {
    // Avec la session du candidat lui-même, comme un enregistrement du profil :
    // RLS et le filtre anti-numéros s'appliquent. Un client à part, sans
    // cookie : voir plus haut pourquoi la session du navigateur attend.
    const asUser = createAnonClient();
    const { error: signInError } = await asUser.auth.signInWithPassword({ phone: e164, password });
    if (signInError) return undo(`Connexion impossible : ${signInError.message}`);

    const writeError = await writeCandidateDetails(asUser, profileId, candidate, {
      addressEditable: true,
      familyEditable: true,
    });

    let documentsError: string | null = null;
    if (!writeError) {
      const { error } = await asUser
        .from("candidate_documents")
        .upsert({ profile_id: profileId, identity_type: identityType }, { onConflict: "profile_id" });
      if (error && !isMissingTable(error)) documentsError = `Pièce non enregistrée : ${error.message}`;
    }

    // Seule cette session-ci est fermée ; le navigateur ouvre la sienne.
    await asUser.auth.signOut({ scope: "local" });

    if (writeError || documentsError) return undo(writeError ?? documentsError!);
  }

  // Le numéro est prouvé : on l'inscrit comme confirmé, par les mêmes fonctions
  // que l'écran de vérification. Un échec ici n'annule rien — le numéro reste
  // simplement à confirmer par appel.
  let verified = false;
  if (verifiedPinId) {
    const started = await admin.rpc("start_phone_verification", {
      p_profile_id: profileId,
      p_phone: phone,
      p_pin_id: verifiedPinId,
    });
    if (!started.error) {
      const confirmed = await admin.rpc("confirm_phone_verification", {
        p_profile_id: profileId,
        p_pin_id: verifiedPinId,
      });
      verified = !confirmed.error;
    }
  }

  // Sans code, l'écran de vérification ne doit pas barrer l'entrée : le
  // numéro sera confirmé par l'équipe, au téléphone.
  if (!verified) await rememberSkip();

  (await cookies()).delete(COOKIE);

  return { ok: true, next: role === "employer" ? "/dashboard/employer" : "/dashboard/candidate" };
}
