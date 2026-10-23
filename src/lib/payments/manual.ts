/**
 * Manual Mobile Money settlement.
 *
 * No operator API is connected. The employer transfers the fee to the
 * platform's own MoMo number, quoting a reference, and an admin reconciles it
 * against the MoMo statement. Everything here is display-only configuration —
 * the amount owed is decided server-side in `lib/bookings/actions.ts`.
 */

export type MomoOperator = {
  id: "mtn" | "airtel";
  label: string;
  /** Merchant number, in local format for a human to retype. */
  number: string | null;
  /** USSD menu to open on the phone, shown as a hint. */
  ussd: string;
};

/**
 * Numbers come from the environment so they can be corrected without a deploy
 * of new code, and so a wrong number is never baked into the repository.
 * `NEXT_PUBLIC_` because the payment screen is a client component.
 */
export const MOMO_OPERATORS: MomoOperator[] = [
  {
    id: "mtn",
    label: "MTN MoMo",
    number: process.env.NEXT_PUBLIC_MOMO_MTN_NUMBER || null,
    ussd: "*105#",
  },
  {
    id: "airtel",
    label: "Airtel Money",
    number: process.env.NEXT_PUBLIC_MOMO_AIRTEL_NUMBER || null,
    ussd: "*128#",
  },
];

/**
 * Numéro WhatsApp où arrivent les reçus Mobile Money.
 *
 * Null quand la variable manque, et non replié sur une valeur écrite ici. Le
 * repli précédent — un numéro en dur — rendait une variable oubliée invisible :
 * les reçus partaient vers le numéro figé au moment où cette ligne a été
 * écrite, et personne ne l'aurait su avant de s'étonner qu'aucun reçu n'arrive.
 * Mieux vaut ne pas proposer le lien que d'en proposer un vers un numéro que
 * nul n'a vérifié.
 */
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || null;

/** True when nothing is configured — the UI then says so instead of inventing a number. */
export function hasConfiguredOperator() {
  return MOMO_OPERATORS.some((operator) => operator.number);
}

/**
 * Short, human-typable reference the employer puts in the transfer note.
 *
 * Derived from the booking id rather than random, so it is reproducible from
 * the row alone — an admin reading a MoMo statement can map it back without a
 * lookup table.
 */
export function paymentReference(bookingId: string) {
  return `MD-${bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** Pre-filled WhatsApp message so the payer doesn't have to retype anything.
 *  `purpose` names what was paid for: « la réservation », « l'abonnement »…
 *  Null sans numéro configuré : l'appelant n'affiche alors pas le lien. */
export function whatsappReceiptLink(
  reference: string,
  amountLabel: string,
  purpose = "la réservation"
): string | null {
  if (!WHATSAPP_NUMBER) return null;
  const text = `Bonjour, je viens d'effectuer le paiement de ${amountLabel} pour ${purpose} ${reference}. Voici le reçu Mobile Money :`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
