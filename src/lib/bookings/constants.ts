/**
 * Connection fee, in XAF.
 *
 * Kept out of `actions.ts`: a `"use server"` module may only export async
 * functions, and exporting a plain constant from one silently strips every
 * export in the file. The server action remains the only thing that decides
 * what a booking actually costs — this is shared so the UI can display the
 * same figure without restating it.
 */
export const BOOKING_FEE_XAF = 15000;

export function formatFee(amount: number = BOOKING_FEE_XAF) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

/** Les trois types de contrat d'une réservation, avec leur libellé. */
export const CONTRACT_LABELS: Record<string, string> = {
  full_time: "Temps plein",
  part_time: "Temps partiel",
  one_off: "Mission ponctuelle",
};

export function contractLabel(value: string | null | undefined) {
  return CONTRACT_LABELS[value ?? ""] ?? "À préciser";
}

/**
 * L'état d'une réservation tel qu'il se lit, côté employeur comme côté candidat.
 *
 * « En attente de vérification » n'est pas un statut en base : c'est
 * `pending_payment` dont le paiement a été déclaré. Voir la migration
 * 20260728000000, qui explique pourquoi aucune valeur d'énumération n'a été
 * ajoutée.
 */
export type BookingView = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  contract_type: string | null;
  start_date: string | null;
  address: string | null;
  payment_declared_at: string | null;
  created_at: string;
};

export function bookingStage(booking: BookingView) {
  if (booking.status === "paid") return "payee" as const;
  if (booking.status === "cancelled") return "annulee" as const;
  if (booking.status === "completed") return "terminee" as const;
  return booking.payment_declared_at ? ("verification" as const) : ("a_payer" as const);
}
