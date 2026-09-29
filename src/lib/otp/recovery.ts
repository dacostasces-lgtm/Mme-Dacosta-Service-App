"use server";

import { cookies } from "next/headers";
import * as z from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalisePhone } from "@/lib/phone";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rate-limit";
import { sendPin, verifyPin, isOtpConfigured } from "@/lib/otp/infobip";

/**
 * Réinitialisation du mot de passe par SMS.
 *
 * Pour les comptes créés avec un numéro seul, il n'existe aucun autre chemin :
 * la réinitialisation de Supabase envoie un lien par email.
 *
 * Le demandeur n'a pas de session, donc l'état vit en base et le cookie ne
 * porte qu'un identifiant aléatoire. Une autre répartition — le numéro et un
 * « vérifié » dans un cookie — serait falsifiable, et suffirait à reprendre
 * n'importe quel compte.
 */

const COOKIE = "md-recup";

export type RecoveryState = { error?: string; sent?: boolean; verified?: boolean; done?: boolean };

/** Toujours la même réponse, que le compte existe ou non : distinguer les deux
 *  transformerait ce formulaire en annuaire des numéros inscrits. */
const REPONSE_NEUTRE = { sent: true } as RecoveryState;

export async function startPhoneRecovery(
  _prev: RecoveryState,
  formData: FormData
): Promise<RecoveryState> {
  if (!isOtpConfigured()) return { error: "Récupération par SMS indisponible." };

  const parsed = normalisePhone(String(formData.get("phone") ?? ""));
  if (!parsed.ok) return { error: parsed.reason };
  const phone = parsed.value;

  // Deux plafonds : Infobip limite par numéro, celui-ci protège des crédits
  // brûlés en visant beaucoup de numéros différents depuis un même endroit.
  const limit = rateLimit(`recovery:${phone}`, { limit: 3, windowSeconds: 3600 });
  if (!limit.ok) return { error: tooManyRequestsMessage(limit.retryAfterSeconds) };

  const supabase = createAdminClient();
  if (!supabase) return { error: "Service indisponible." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  // Aucun compte : on s'arrête, sans le dire. Le SMS n'est pas envoyé, ce qui
  // évite aussi de facturer des messages vers des numéros au hasard.
  if (!profile) return REPONSE_NEUTRE;

  const sent = await sendPin(phone);
  if (!sent.ok) return { error: sent.error };

  const { data: row, error } = await supabase
    .from("phone_recovery")
    .insert({ phone, pin_id: sent.pinId })
    .select("id")
    .single();

  if (error || !row) return { error: "Demande impossible pour le moment." };

  (await cookies()).set(COOKIE, row.id as string, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 15,
    path: "/",
  });

  return REPONSE_NEUTRE;
}

export async function verifyPhoneRecovery(
  _prev: RecoveryState,
  formData: FormData
): Promise<RecoveryState> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return { error: "Demande expirée. Recommencez." };

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { error: "Le code compte six chiffres." };

  const supabase = createAdminClient();
  if (!supabase) return { error: "Service indisponible." };

  const { data: row } = await supabase
    .from("phone_recovery")
    .select("id, pin_id, expires_at, used_at")
    .eq("id", id)
    .maybeSingle();

  if (!row || row.used_at || new Date(row.expires_at as string) < new Date()) {
    return { error: "Demande expirée. Recommencez." };
  }

  const result = await verifyPin(row.pin_id as string, code);
  if (!result.ok) return { error: result.error };

  await supabase
    .from("phone_recovery")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", id);

  return { verified: true };
}

const passwordSchema = z
  .object({
    password: z.string().min(8, "Au moins 8 caractères"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirm"],
  });

export async function resetPasswordByPhone(
  _prev: RecoveryState,
  formData: FormData
): Promise<RecoveryState> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return { error: "Demande expirée. Recommencez." };

  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };

  const supabase = createAdminClient();
  if (!supabase) return { error: "Service indisponible." };

  const { data: row } = await supabase
    .from("phone_recovery")
    .select("id, phone, verified_at, used_at, expires_at")
    .eq("id", id)
    .maybeSingle();

  // Les trois conditions comptent autant : non vérifiée, déjà consommée ou
  // périmée, une demande ne doit plus rien autoriser.
  if (
    !row ||
    !row.verified_at ||
    row.used_at ||
    new Date(row.expires_at as string) < new Date()
  ) {
    return { error: "Demande expirée. Recommencez." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("phone", row.phone as string)
    .maybeSingle();

  if (!profile?.user_id) return { error: "Compte introuvable." };

  const { error } = await supabase.auth.admin.updateUserById(profile.user_id as string, {
    password: parsed.data.password,
  });
  if (error) return { error: `Changement impossible : ${error.message}` };

  // Consommée avant de rendre la main : sans ce marquage, le même cookie
  // rejouerait le changement autant de fois qu'on le souhaite.
  await supabase
    .from("phone_recovery")
    .update({ used_at: new Date().toISOString() })
    .eq("id", id);

  (await cookies()).delete(COOKIE);
  return { done: true };
}
