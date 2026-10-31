"use server";

import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalisePhone } from "@/lib/phone";
import { consumeDurableLimit } from "@/lib/rate-limit-durable";
import { tooManyRequestsMessage } from "@/lib/rate-limit";
import {
  checkDeposit,
  isPawapayConfigured,
  predireOperateur,
  startDeposit,
} from "@/lib/payments/pawapay";

/** Les quatre achats réglés par Mobile Money. */
export type Achat = "contact_unlock" | "candidate_unlock" | "job_payment" | "subscription";

export type PaiementState = {
  error?: string;
  /** Rendu dès que la demande est partie : la page interroge ensuite l'état. */
  depositId?: string;
  /** Dernier état connu, repris de PawaPay. */
  status?: "ACCEPTED" | "PROCESSING" | "IN_RECONCILIATION" | "COMPLETED" | "FAILED";
};

const LIBELLES: Record<Achat, string> = {
  contact_unlock: "Numero employeur",
  candidate_unlock: "Numero candidat",
  job_payment: "Publication offre",
  subscription: "Abonnement Premium",
};

/**
 * Lance la demande de paiement sur le téléphone de l'acheteur.
 *
 * Le montant n'est jamais reçu d'ici : `start_pawapay_deposit` le lit sur la
 * ligne achetée et nous le rend. C'est la règle qui empêche un acheteur de se
 * faire un Premium Employeur à 100 FCFA en trafiquant sa requête, et elle doit
 * rester en base — l'API est ouverte avec la clé publique.
 */
export async function payerParMobileMoney(
  achat: Achat,
  targetId: string,
  _previous: PaiementState,
  formData: FormData
): Promise<PaiementState> {
  const user = await requireUser();
  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }
  if (!isPawapayConfigured()) {
    return { error: "Le paiement en ligne n'est pas encore activé sur ce déploiement." };
  }

  // Durable : une limite en mémoire se remet à zéro à chaque démarrage, et une
  // demande de paiement fait sonner un téléphone. Dix par heure laissent la
  // place aux reprises sans permettre de harceler un numéro.
  const limite = await consumeDurableLimit(`paiement:${user.id}`, 10, 3600);
  if (!limite.ok) return { error: tooManyRequestsMessage(limite.retryAfterSeconds) };

  const saisi = String(formData.get("phone") ?? "").trim();
  const parse = normalisePhone(saisi);
  if (!parse.ok) {
    return { error: "Saisissez le numéro Mobile Money qui paiera, par exemple 06 717 30 30." };
  }
  const international = `+${parse.value.replace(/\D/g, "")}`;

  // L'opérateur se déduit du numéro : il n'y a plus de numéro marchand à
  // choisir, donc plus de « Airtel Money n'est pas configuré ».
  const operateur = await predireOperateur(international);
  if (!operateur.ok) {
    return { error: `Numéro non reconnu : ${operateur.error}` };
  }

  const depositId = randomUUID();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_pawapay_deposit", {
    p_purpose: achat,
    p_target_id: targetId,
    p_deposit_id: depositId,
    p_phone: operateur.data.phoneNumber,
    p_provider: operateur.data.provider,
  });

  if (error) {
    // 23505 : un versement est déjà en vol pour cet achat. Le dire plutôt que
    // d'en lancer un second, qui ferait payer deux fois.
    if (error.code === "23505") {
      return { error: "Une demande de paiement est déjà en cours. Regardez votre téléphone." };
    }
    return { error: `Paiement impossible : ${error.message}` };
  }

  const ligne = (data as { amount: number; currency: string }[] | null)?.[0];
  if (!ligne) return { error: "Achat introuvable ou déjà réglé." };

  const envoi = await startDeposit({
    depositId,
    amount: ligne.amount,
    currency: ligne.currency,
    phoneNumber: operateur.data.phoneNumber,
    provider: operateur.data.provider,
    customerMessage: LIBELLES[achat],
  });

  if (!envoi.ok) {
    // On ne marque rien en échec ici : un appel qui n'aboutit pas peut quand
    // même avoir lancé l'ordre chez l'opérateur. L'état se demandera à
    // PawaPay, qui seul sait.
    return { error: envoi.error, depositId };
  }

  if (envoi.data.status === "REJECTED") {
    await marquerEtat(depositId, "FAILED", null, envoi.data.failureReason?.failureCode ?? null);
    return {
      error:
        envoi.data.failureReason?.failureMessage ??
        "Paiement refusé par l'opérateur. Vérifiez votre numéro et votre solde.",
    };
  }

  return { depositId, status: "ACCEPTED" };
}

/**
 * Demande l'état à PawaPay et règle l'achat s'il a abouti.
 *
 * Appelée par la page de l'acheteur pendant qu'il tape son code, et par la
 * route de rappel. Les deux peuvent arriver ensemble : `settle_pawapay_deposit`
 * est rejouable.
 */
export async function etatDuPaiement(depositId: string): Promise<PaiementState> {
  await requireUser();
  return relireEtRegler(depositId);
}

/** Le travail commun à la page et au rappel, sans contrôle de session : le
 *  rappel vient de PawaPay, pas d'un navigateur connecté. */
export async function relireEtRegler(depositId: string): Promise<PaiementState> {
  const etat = await checkDeposit(depositId);
  if (!etat.ok) return { error: etat.error, depositId };

  if (etat.data.status === "NOT_FOUND") {
    // Seul cas où l'absence vaut échec, et seulement après une initiation
    // acceptée : la documentation de PawaPay est explicite là-dessus.
    await marquerEtat(depositId, "FAILED", null, "NOT_FOUND");
    return { depositId, status: "FAILED", error: "Paiement introuvable chez l'opérateur." };
  }

  const info = etat.data.data!;
  await marquerEtat(
    depositId,
    info.status,
    info.providerTransactionId ?? null,
    info.failureReason?.failureCode ?? null
  );

  return {
    depositId,
    status: info.status,
    error:
      info.status === "FAILED"
        ? (info.failureReason?.failureMessage ?? "Le paiement n'a pas abouti.")
        : undefined,
  };
}

/** Le règlement passe par la clé de service : la fonction règle de l'argent
 *  sans contrôler de rôle, donc elle n'est pas offerte aux comptes ordinaires. */
async function marquerEtat(
  depositId: string,
  status: string,
  providerTx: string | null,
  failureCode: string | null
) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.rpc("settle_pawapay_deposit", {
    p_deposit_id: depositId,
    p_status: status,
    p_provider_tx: providerTx,
    p_failure_code: failureCode,
  });
}
