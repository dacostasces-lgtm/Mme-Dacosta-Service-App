"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rate-limit";
import { sendPin, verifyPin } from "@/lib/otp/infobip";
import { rememberSkip, forgetSkip } from "@/lib/otp/skip";

export type OtpState = { error?: string; sent?: boolean; verified?: boolean; ok?: boolean };

/**
 * Envoie un code au numéro enregistré sur le profil de l'appelant.
 *
 * Le numéro vient de la base, jamais du formulaire : sinon n'importe qui
 * ferait envoyer des SMS vers n'importe quel numéro depuis nos crédits, et
 * ferait valider un numéro qui n'est pas celui de son profil.
 */
export async function sendPhoneOtp(): Promise<OtpState> {
  // `allowUnverifiedPhone` est vital ici : sans lui, la porte posée dans
  // requireUser redirige depuis l'action elle-même — appelée précisément par
  // quelqu'un dont le numéro n'est pas encore vérifié. L'action n'aboutit
  // jamais, et la vérification devient impossible à franchir.
  const user = await requireUser({ allowUnverifiedPhone: true });
  if (!user.profileId) return { error: "Profil introuvable." };

  // Infobip limite déjà par numéro ; cette barrière-ci protège nos crédits
  // contre un compte qui viserait plusieurs numéros à la suite.
  const limit = rateLimit(`otp-send:${user.id}`, { limit: 5, windowSeconds: 900 });
  if (!limit.ok) return { error: tooManyRequestsMessage(limit.retryAfterSeconds) };

  const supabase = await createClient();
  const { data: contact } = await supabase.rpc("my_contact");
  const phone = (contact ?? [])[0]?.phone as string | undefined;

  if (!phone) {
    return { error: "Aucun numéro enregistré. Renseignez-le dans votre profil d'abord." };
  }

  // Les fonctions qui écrivent la demande et la confirmation ne s'appellent
  // plus qu'avec la clé de service (20261012010000_security_fixes.sql) :
  // ouvertes à tout compte, elles laissaient marquer son numéro « vérifié »
  // sans recevoir de SMS.
  const admin = createAdminClient();
  if (!admin) {
    return { error: "Vérification indisponible : SUPABASE_SERVICE_ROLE_KEY absente sur ce déploiement." };
  }

  const sent = await sendPin(phone);
  if (!sent.ok) return { error: sent.error };

  // Le numéro est repassé : si le profil a changé de numéro pendant l'envoi,
  // la demande est refusée plutôt que de valider le nouveau avec ce code.
  const { error } = await admin.rpc("start_phone_verification", {
    p_profile_id: user.profileId,
    p_phone: phone,
    p_pin_id: sent.pinId,
  });
  if (error) return { error: `Enregistrement impossible : ${error.message}` };

  revalidatePath("/[locale]/profil", "page");
  return { sent: true };
}

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Le code compte six chiffres."),
});

/**
 * Vérifie le code saisi contre la demande en cours.
 *
 * L'identifiant de la demande est relu en base plutôt que reçu du formulaire :
 * présenter celui d'une demande émise pour un autre numéro suffirait sinon à
 * faire marquer le sien comme vérifié.
 */
export async function verifyPhoneOtp(
  _previous: OtpState,
  formData: FormData
): Promise<OtpState> {
  const user = await requireUser({ allowUnverifiedPhone: true });
  if (!user.profileId) return { error: "Profil introuvable." };

  const limit = rateLimit(`otp-verify:${user.id}`, { limit: 10, windowSeconds: 900 });
  if (!limit.ok) return { error: tooManyRequestsMessage(limit.retryAfterSeconds) };

  const parsed = schema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Code invalide." };
  }

  const supabase = await createClient();
  // Par la fonction gardée, pas par un SELECT : la colonne est révoquée comme
  // `phone`, et une lecture directe échouait en « permission denied ».
  const { data: pinId, error: pinError } = await supabase.rpc("my_phone_otp_pin_id");

  // Distinct de « aucune demande en cours », et c'est tout le sujet : cette
  // confusion a fait répondre « demandez-en un nouveau » pendant une semaine
  // à des gens qui tenaient le bon code. Une lecture qui échoue n'est pas une
  // absence de demande, et doit se voir comme une panne.
  if (pinError) {
    return { error: `Vérification indisponible : ${pinError.message}` };
  }

  if (!pinId) {
    return { error: "Aucun code en attente. Demandez-en un nouveau." };
  }

  const result = await verifyPin(pinId, parsed.data.code);
  if (!result.ok) return { error: result.error };

  // Seulement après qu'Infobip a validé le code, et avec la clé de service.
  const admin = createAdminClient();
  if (!admin) {
    return { error: "Vérification indisponible : SUPABASE_SERVICE_ROLE_KEY absente sur ce déploiement." };
  }
  const { error } = await admin.rpc("confirm_phone_verification", {
    p_profile_id: user.profileId,
    p_pin_id: pinId,
  });
  if (error) return { error: `Enregistrement impossible : ${error.message}` };

  await forgetSkip();
  revalidatePath("/", "layout");
  return { verified: true };
}

/**
 * Laisse entrer malgré un numéro non vérifié, après un envoi qui a échoué.
 *
 * Le profil reste marqué non vérifié : c'est la modération qui refusera de le
 * publier, et c'est le bon endroit pour que la contrainte pèse — pas sur
 * l'accès de quelqu'un à son propre compte.
 */
export async function skipPhoneVerification(): Promise<OtpState> {
  await requireUser({ allowUnverifiedPhone: true });
  await rememberSkip();
  revalidatePath("/", "layout");
  return { ok: true } as OtpState;
}
