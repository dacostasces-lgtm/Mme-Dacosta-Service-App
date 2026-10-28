import {
  needsBackSide,
  needsDrivingLicense,
  type DocumentsRow,
} from "@/lib/candidates/documents";

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
  /** Pièces justificatives (20261028100000_pieces_et_refus.sql), chemins dans
   *  le seau privé. « ? » quand elles n'ont pas pu être lues : elles ne sont
   *  alors pas réclamées. */
  identityType: string | null | undefined;
  identityFront: string | null | undefined;
  identityBack: string | null | undefined;
  drivingLicense: string | null | undefined;
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
  ["identityType", "Type de pièce d'identité"],
  ["identityFront", "Pièce d'identité (recto)"],
  ["identityBack", "Pièce d'identité (verso)"],
  ["drivingLicense", "Permis de conduire"],
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
    // Un passeport n'a pas de verso ; le permis ne se demande qu'aux chauffeurs.
    if (key === "identityBack") {
      return needsBackSide(fields.identityType) && !filled(fields.identityBack);
    }
    if (key === "drivingLicense") {
      return needsDrivingLicense(fields.jobTitle) && !filled(fields.drivingLicense);
    }
    return !filled(fields[key]);
  }).map(([key, label]) =>
    key === "identityFront" && fields.identityType === "passeport" ? "Passeport" : label
  );
}

/**
 * Les pièces telles que les renvoie candidate_documents. Une lecture en échec
 * (table pas encore créée) donne « ? » ; pas de ligne, rien d'envoyé.
 */
export function documentsFromRow(
  row: Partial<DocumentsRow> | null | undefined,
  readable: boolean
): Pick<CandidateFields, "identityType" | "identityFront" | "identityBack" | "drivingLicense"> {
  if (!readable) {
    return { identityType: "?", identityFront: "?", identityBack: "?", drivingLicense: "?" };
  }
  return {
    identityType: row?.identity_type ?? null,
    identityFront: row?.identity_front ?? null,
    identityBack: row?.identity_back ?? null,
    drivingLicense: row?.driving_license ?? null,
  };
}

/** Le même « ? » pour l'enregistrement du formulaire : les pièces s'envoient
 *  à part, elles ne bloquent pas l'enregistrement des cases. */
export const DOCUMENTS_NOT_CHECKED = documentsFromRow(null, false);

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

export const REJECTED_PROFILE_MESSAGE =
  "Votre profil n'a pas été retenu par notre équipe : vous ne pouvez pas postuler pour le moment. Votre tableau de bord vous dit pourquoi.";

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
