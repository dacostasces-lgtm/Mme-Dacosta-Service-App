/**
 * Pièces justificatives d'un candidat : pièce d'identité, et permis de conduire
 * pour les chauffeurs (20261028100000_pieces_et_refus.sql).
 *
 * Elles ne se montrent qu'au candidat et à l'administration, qui vérifie
 * l'identité avant de publier — jamais aux familles ni au public.
 */

export const IDENTITY_TYPES = [
  { value: "cni", label: "Carte d'identité" },
  { value: "passeport", label: "Passeport" },
  { value: "carte_sejour", label: "Carte de séjour" },
  { value: "carte_consulaire", label: "Carte consulaire" },
] as const;

export type IdentityType = (typeof IDENTITY_TYPES)[number]["value"];

export const IDENTITY_TYPE_VALUES = IDENTITY_TYPES.map((type) => type.value) as [
  IdentityType,
  ...IdentityType[],
];

export function identityTypeLabel(value: string | null | undefined) {
  return IDENTITY_TYPES.find((type) => type.value === value)?.label ?? null;
}

/** Un passeport se lit sur une page ; une carte a deux faces. */
export function needsBackSide(identityType: string | null | undefined) {
  return identityType !== "passeport";
}

/** Le permis se demande à qui se présente comme chauffeur, liste ou « Autre ». */
export function needsDrivingLicense(jobTitle: string | null | undefined) {
  return /chauffeur/i.test(jobTitle ?? "");
}

/** Les trois pièces, avec leur colonne et leur nom de fichier dans le seau. */
export const DOCUMENT_KINDS = {
  identity_front: { file: "identite_recto", label: "Recto" },
  identity_back: { file: "identite_verso", label: "Verso" },
  driving_license: { file: "permis", label: "Permis de conduire" },
} as const;

export type DocumentKind = keyof typeof DOCUMENT_KINDS;

export function isDocumentKind(value: string): value is DocumentKind {
  return value in DOCUMENT_KINDS;
}

export const DOCUMENTS_BUCKET = "pieces";
export const DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/**
 * Ce que le sélecteur de fichiers laisse choisir, plus large que ce que le
 * seau accepte. Un iPhone range ses photos en HEIC : sans ces entrées, elles
 * apparaissent grisées et la personne croit son téléphone en cause. Elles
 * sont réencodées en JPEG avant l'envoi (src/lib/images/compresser.ts) ; la
 * validation, elle, reste sur les formats du seau.
 */
export const DOCUMENTS_CHOISIR = [...DOCUMENT_TYPES, "image/heic", "image/heif"].join(",");
export const DOCUMENT_MAX = 10 * 1024 * 1024;

/** Ce que lit la modération et le candidat : la ligne de candidate_documents. */
export type DocumentsRow = {
  identity_type: string | null;
  identity_front: string | null;
  identity_back: string | null;
  driving_license: string | null;
};

/** L'adresse qui ouvre une pièce : un lien signé frais à chaque clic. */
export function documentHref(profileId: string, kind: DocumentKind) {
  return `/api/pieces/${profileId}/${kind}`;
}
