/**
 * Ce qu'un profil candidat doit contenir pour être complet.
 *
 * Une seule liste, lue par l'enregistrement du profil (qui refuse un profil
 * incomplet), par le tableau de bord et par les actions réservées aux profils
 * complets (postuler, débloquer un numéro). Le WhatsApp n'y est pas : il vaut
 * le téléphone quand il est vide. « Dormir sur place » non plus : c'est une
 * case à cocher, sans état « non renseigné ».
 */
export type CandidateFields = {
  phonePresent: boolean;
  neighborhoodId: string | null | undefined;
  jobTitle: string | null | undefined;
  experience: string | null | undefined;
  age: number | null | undefined;
  gender: string | null | undefined;
  availability: string | null | undefined;
  desiredSalary: number | null | undefined;
  skills: unknown;
  languages: unknown;
  workDays: unknown;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
};

const filled = (value: unknown) =>
  Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";

const RULES: [keyof CandidateFields, string][] = [
  ["phonePresent", "Téléphone"],
  ["neighborhoodId", "Quartier"],
  ["jobTitle", "Poste recherché"],
  ["experience", "Années d'expérience"],
  ["age", "Âge"],
  ["gender", "Sexe"],
  ["availability", "Disponibilité"],
  ["desiredSalary", "Salaire souhaité"],
  ["skills", "Compétences"],
  ["languages", "Langues parlées"],
  ["workDays", "Jours de disponibilité"],
  ["startTime", "Heure de début"],
  ["endTime", "Heure de fin"],
];

/** Les libellés des cases encore vides, dans l'ordre du formulaire. */
export function missingCandidateFields(fields: CandidateFields): string[] {
  return RULES.filter(([key]) =>
    key === "phonePresent" ? !fields.phonePresent : !filled(fields[key])
  ).map(([, label]) => label);
}

export const INCOMPLETE_PROFILE_MESSAGE =
  "Complétez d'abord votre profil : toutes les cases doivent être remplies.";

/** Le choix proposé pour « Années d'expérience », en clair. */
export const EXPERIENCE_OPTIONS = [
  "Moins d'un an",
  "1 an",
  ...Array.from({ length: 14 }, (_, i) => `${i + 2} ans`),
  "Plus de 15 ans",
];
