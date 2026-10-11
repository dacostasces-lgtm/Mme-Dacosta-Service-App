/**
 * Détecte un numéro de téléphone dans un texte libre.
 *
 * Même règle que public.contains_phone_number() en base
 * (20261011050000_block_phone_numbers.sql), qui reste la garde réelle : ce
 * contrôle-ci ne sert qu'à afficher le refus avant l'aller-retour, avec un
 * message à la place d'une erreur SQL.
 *
 * Neuf chiffres ou plus, même séparés par des espaces, points, tirets ou
 * parenthèses, ou un lien WhatsApp direct. Une date ou un montant n'atteignent
 * pas neuf chiffres.
 */
export function containsPhoneNumber(text: string | null | undefined) {
  if (!text) return false;
  const joined = text.replace(/(?<=\d)[ .()-]{1,3}(?=\d)/g, "");
  return /\d{9,}/.test(joined) || /(wa\.me\/|api\.whatsapp\.com|chat\.whatsapp\.com)/i.test(text);
}

export const PHONE_NUMBER_REFUSED =
  "Les numéros de téléphone ne peuvent pas être partagés dans l'application. Retirez-le pour continuer.";
