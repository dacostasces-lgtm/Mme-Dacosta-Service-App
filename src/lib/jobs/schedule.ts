/**
 * Jours et horaires de service d'une offre. Partagés par le formulaire, l'action
 * qui l'enregistre, la liste des offres et la fiche d'une offre, qui ne doivent
 * pas diverger sur les codes stockés en base ni sur leur libellé.
 */

/** Codes stockés dans `jobs.work_days`, dans l'ordre de la semaine. */
export const WORK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type WorkDay = (typeof WORK_DAYS)[number];

export const WORK_DAY_LABELS: Record<WorkDay, string> = {
  mon: "Lundi",
  tue: "Mardi",
  wed: "Mercredi",
  thu: "Jeudi",
  fri: "Vendredi",
  sat: "Samedi",
  sun: "Dimanche",
};

const SHORT_LABELS: Record<WorkDay, string> = {
  mon: "Lun",
  tue: "Mar",
  wed: "Mer",
  thu: "Jeu",
  fri: "Ven",
  sat: "Sam",
  sun: "Dim",
};

export function isWorkDay(value: unknown): value is WorkDay {
  return typeof value === "string" && (WORK_DAYS as readonly string[]).includes(value);
}

/** Remet les jours dans l'ordre de la semaine et écarte les doublons. */
export function sortWorkDays(days: readonly string[]): WorkDay[] {
  return WORK_DAYS.filter((day) => days.includes(day));
}

/**
 * « Lundi au vendredi » plutôt que cinq jours énumérés quand ils se suivent ;
 * sinon la liste abrégée. Null si aucun jour n'a été précisé.
 */
export function formatWorkDays(days: readonly string[] | null | undefined) {
  const sorted = sortWorkDays(days ?? []);
  if (sorted.length === 0) return null;
  if (sorted.length === 7) return "Tous les jours";
  if (sorted.length === 1) return WORK_DAY_LABELS[sorted[0]];

  const first = WORK_DAYS.indexOf(sorted[0]);
  const consecutive = sorted.every((day, i) => WORK_DAYS.indexOf(day) === first + i);
  if (consecutive && sorted.length >= 3) {
    const last = sorted[sorted.length - 1];
    return `Du ${WORK_DAY_LABELS[sorted[0]].toLowerCase()} au ${WORK_DAY_LABELS[last].toLowerCase()}`;
  }

  return sorted.map((day) => SHORT_LABELS[day]).join(", ");
}

/** Postgres renvoie un `time` en « 08:00:00 » ; on n'affiche que « 8h00 ». */
function formatTime(value: string) {
  const [h, m] = value.split(":");
  return `${Number(h)}h${m ?? "00"}`;
}

export function formatHours(start: string | null | undefined, end: string | null | undefined) {
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`;
  if (start) return `À partir de ${formatTime(start)}`;
  if (end) return `Jusqu'à ${formatTime(end)}`;
  return null;
}
