"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
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

  const sent = await sendPin(phone);
  if (!sent.ok) return { error: sent.error };

  const { error } = await supabase.rpc("start_phone_verification", { p_pin_id: sent.pinId });
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
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone_otp_pin_id")
    .eq("id", user.profileId)
    .maybeSingle();

  const pinId = profile?.phone_otp_pin_id as string | null | undefined;
  if (!pinId) {
    return { error: "Aucun code en attente. Demandez-en un nouveau." };
  }

  const result = await verifyPin(pinId, parsed.data.code);
  if (!result.ok) return { error: result.error };

  const { error } = await supabase.rpc("confirm_phone_verification", { p_pin_id: pinId });
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
