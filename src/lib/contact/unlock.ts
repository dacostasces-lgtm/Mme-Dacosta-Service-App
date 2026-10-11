/**
 * Prix du déblocage d'un numéro, pour l'affichage seulement.
 *
 * Le montant facturé est fixé en base, par request_contact_unlock()
 * (20261011040000_employer_contact.sql) : changer l'un sans l'autre afficherait
 * un prix et en encaisserait un autre.
 */
export const UNLOCK_PRICE = 500;

/** « 06 111 11 11 » → « 24206111111 », la forme qu'attend wa.me. */
export function whatsappLink(number: string, text?: string) {
  const digits = number.replace(/\D/g, "");
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}

export function telLink(number: string) {
  return `tel:${number.replace(/[^\d+]/g, "")}`;
}
