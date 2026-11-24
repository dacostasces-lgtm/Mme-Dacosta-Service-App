/**
 * Offres d'emploi à l'international (20261124100000_offres_internationales.sql).
 *
 * Publiées par l'administration seule, gratuitement, pour un placement dans un
 * autre pays. On y postule avec le CV du profil et deux références, que seule
 * l'administration lit.
 */

/** Le nombre de références demandé, tenu aussi en base (position 1 à 2). */
export const REFERENCES_COUNT = 2;

/** Proposées à la saisie du pays ; un autre pays s'écrit librement. */
export const DESTINATIONS = [
  "France",
  "Belgique",
  "Suisse",
  "Canada",
  "Liban",
  "Arabie saoudite",
  "Émirats arabes unis",
  "Qatar",
  "Koweït",
  "Oman",
  "Maroc",
  "Tunisie",
  "Gabon",
  "Cameroun",
  "Côte d'Ivoire",
  "Sénégal",
  "Royaume-Uni",
  "Allemagne",
  "Italie",
  "Espagne",
  "États-Unis",
];

/** « Paris, France », ou le pays seul. */
export function formatDestination(country: string | null | undefined, city: string | null | undefined) {
  return [city?.trim(), country?.trim()].filter(Boolean).join(", ");
}

export type InternationalFields = {
  is_international?: boolean | null;
  destination_country?: string | null;
  destination_city?: string | null;
  salary_text?: string | null;
};
