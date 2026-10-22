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
  /** Adresse précise, privée (20261012000000_candidate_address.sql). */
  address: string | null | undefined;
  jobTitle: string | null | undefined;
  experience: string | null | undefined;
  age: number | null | undefined;
  gender: string | null | undefined;
  /** Situation familiale (20261022000000_situation_familiale.sql). « ? »
   *  quand elle n'a pas pu être lue : elle n'est alors pas réclamée. */
  maritalStatus: string | null | undefined;
  childrenCount: number | string | null | undefined;
  youngestChildAge: number | string | null | undefined;
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
  ["address", "Adresse précise"],
  ["jobTitle", "Poste recherché"],
  ["experience", "Années d'expérience"],
  ["age", "Âge"],
  ["gender", "Sexe"],
  ["maritalStatus", "Situation matrimoniale"],
  ["childrenCount", "Nombre d'enfants"],
  ["youngestChildAge", "Âge du dernier enfant"],
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
  return RULES.filter(([key]) => {
    if (key === "phonePresent") return !fields.phonePresent;
    // L'âge du dernier enfant ne se demande qu'à qui en a au moins un.
    if (key === "youngestChildAge") {
      return (
        typeof fields.childrenCount === "number" &&
        fields.childrenCount > 0 &&
        !filled(fields.youngestChildAge)
      );
    }
    return !filled(fields[key]);
  }).map(([, label]) => label);
}

/**
 * La situation familiale telle que la renvoient my_candidate_details() et
 * admin_candidate_private(). Une colonne absente du résultat (fonction pas
 * encore mise à jour en base) donne « ? » : personne n'est bloqué pour une
 * case qu'il ne pourrait pas encore remplir.
 */
export function situationFromRow(row: Record<string, unknown> | null | undefined) {
  const read = (key: string) =>
    row && key in row ? (row[key] as string | number | null) : "?";
  return {
    maritalStatus: read("marital_status") as string | null,
    childrenCount: read("children_count"),
    youngestChildAge: read("youngest_child_age"),
  };
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

/**
 * Une table pas encore créée en base, lue par l'API : PostgREST répond
 * PGRST205, Postgres 42P01. Sert à ne pas bloquer le site entre le
 * déploiement du code et le passage de la migration.
 */
export function isMissingTable(error: { code?: string } | null | undefined) {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/** Une fonction pas encore créée en base : PGRST202 côté PostgREST, 42883
 *  côté Postgres. Même usage qu'isMissingTable. */
export function isMissingFunction(error: { code?: string } | null | undefined) {
  return error?.code === "PGRST202" || error?.code === "42883";
}
