/**
 * Les quatre disponibilités d'un candidat, avec leur libellé.
 *
 * Rassemblées ici parce que la même correspondance existait à six endroits —
 * deux pages de recherche, trois formulaires, une action — et qu'elles avaient
 * déjà divergé sur la casse (« Temps Plein » contre « Temps plein »).
 */

export const AVAILABILITY_VALUES = [
  "full_time",
  "part_time",
  "internal",
  "external",
] as const;

export type Availability = (typeof AVAILABILITY_VALUES)[number];

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  full_time: "Temps plein",
  part_time: "Temps partiel",
  internal: "Logé(e) sur place",
  external: "Non logé(e)",
};

/** Pour alimenter un <select>, dans l'ordre d'affichage voulu. */
export const AVAILABILITY_OPTIONS = AVAILABILITY_VALUES.map((value) => ({
  value,
  label: AVAILABILITY_LABELS[value],
}));

/**
 * Ce qu'on propose désormais à la saisie : le rythme seulement. Le logement
 * se dit par la case « Dormir sur place » (candidate_details.live_in) ; le
 * proposer aussi ici permettait deux réponses contradictoires. Les valeurs
 * `internal` / `external` déjà enregistrées restent lisibles et affichées.
 */
export const RHYTHM_OPTIONS = AVAILABILITY_OPTIONS.filter(
  (option) => option.value === "full_time" || option.value === "part_time"
);

/** Libellé d'une valeur venue de la base, qui peut être nulle ou inconnue. */
export function availabilityLabel(value: string | null | undefined) {
  if (!value) return "À préciser";
  return AVAILABILITY_LABELS[value as Availability] ?? "À préciser";
}
