/**
 * Prix d'une offre payante, pour l'affichage seulement.
 *
 * Le montant facturé est fixé en base, par request_job_payment()
 * (20261011060000_paid_job_offers.sql) : changer l'un sans l'autre afficherait
 * un prix et en encaisserait un autre.
 */
export const JOB_PRICE = 5000;

export type JobPaymentRow = {
  id: string;
  status: "pending_payment" | "active" | "rejected";
  payment_declared_at: string | null;
};

/** `job_payments` est embarqué par PostgREST en objet (relation un-à-un) ou en
 *  tableau selon la version : on accepte les deux. */
export function firstPayment(value: JobPaymentRow | JobPaymentRow[] | null | undefined) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
