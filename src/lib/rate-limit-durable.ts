import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";

/**
 * Limite partagée par toutes les instances, et qui survit à un démarrage à
 * froid — contrairement à `rateLimit`, qui compte en mémoire.
 *
 * Réservée à ce qui coûte de l'argent ou ouvre un compte : un envoi de SMS. Le
 * reste peut rester en mémoire, où un dépassement ne coûte qu'une requête.
 *
 * Repli sur la limite mémoire si la base est injoignable : mieux vaut un
 * plafond approximatif que pas de plafond du tout. Jamais l'inverse — laisser
 * passer parce que le compteur est en panne, c'est exactement le moment où
 * quelqu'un en profite.
 */
export async function consumeDurableLimit(
  cle: string,
  limite: number,
  fenetreSecondes: number
): Promise<RateLimitResult> {
  const admin = createAdminClient();
  if (!admin) return rateLimit(cle, { limit: limite, windowSeconds: fenetreSecondes });

  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_cle: cle,
    p_limite: limite,
    p_fenetre: fenetreSecondes,
  });

  if (error) {
    return rateLimit(cle, { limit: limite, windowSeconds: fenetreSecondes });
  }

  const attendre = Number(data ?? 0);
  return attendre > 0 ? { ok: false, retryAfterSeconds: attendre } : { ok: true };
}

/**
 * Plafond global des envois de SMS, par jour.
 *
 * C'est la seule limite qu'un fraudeur ne contourne pas en ouvrant des
 * comptes : les limites par utilisateur se multiplient avec eux, pas celle-ci.
 * Dimensionné pour qu'un usage normal ne l'atteigne jamais — à relever le jour
 * où la plateforme aura ce volume d'inscriptions quotidiennes, et pas avant.
 */
export const PLAFOND_SMS_PAR_JOUR = Number(process.env.SMS_PLAFOND_QUOTIDIEN ?? 200);

export async function consumeSmsBudget(): Promise<RateLimitResult> {
  return consumeDurableLimit("sms:global", PLAFOND_SMS_PAR_JOUR, 86_400);
}
