/**
 * Les étapes d'une candidature (enum `application_status`), avec leur libellé
 * vu du candidat. L'employeur les fait avancer depuis son tableau de bord.
 */
export const APPLICATION_STATUSES = [
  "new",
  "contact",
  "interview",
  "pending",
  "hired",
  "rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "Envoyée",
  contact: "L'employeur vous a contacté(e)",
  interview: "Entretien prévu",
  pending: "En réflexion",
  hired: "Retenue",
  rejected: "Non retenue",
};

/** Libellés côté employeur, pour le menu qui fait avancer la candidature. */
export const EMPLOYER_STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "Nouvelle",
  contact: "Contacté(e)",
  interview: "Entretien",
  pending: "En réflexion",
  hired: "Retenu(e)",
  rejected: "Non retenu(e)",
};

export function applicationStatusLabel(value: string | null | undefined) {
  return APPLICATION_STATUS_LABELS[value as ApplicationStatus] ?? "Envoyée";
}

export const STATUS_TONE: Record<ApplicationStatus, string> = {
  new: "bg-muted text-muted-foreground",
  contact: "bg-primary/10 text-primary",
  interview: "bg-secondary/25 text-foreground",
  pending: "bg-muted text-muted-foreground",
  hired: "bg-green-500/15 text-green-700 dark:text-green-400",
  rejected: "bg-destructive/10 text-destructive",
};
