"use server";

import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { normalisePhone } from "@/lib/phone";

export type PhoneState = { error?: string };

/**
 * Enregistre le numéro depuis l'écran de vérification.
 *
 * Distinct de `updateProfile` : cet écran est franchi avant d'atteindre son
 * espace, et faire passer tout le formulaire de profil par ce chemin
 * obligerait à accepter des champs qu'il n'affiche pas.
 */
export async function updatePhoneOnly(input: string): Promise<PhoneState> {
  const user = await requireUser({ allowUnverifiedPhone: true });
  if (!user.profileId) return { error: "Profil introuvable." };

  const parsed = z.string().trim().min(1, "Saisissez votre numéro.").safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Numéro invalide." };

  const phone = normalisePhone(parsed.data);
  if (!phone.ok) return { error: phone.reason };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ phone: phone.value })
    .eq("id", user.profileId);

  if (error) return { error: `Enregistrement impossible : ${error.message}` };
  return {};
}
