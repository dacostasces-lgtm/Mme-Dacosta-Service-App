import * as z from "zod";
import { WORK_DAYS, sortWorkDays } from "@/lib/jobs/schedule";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Les champs de <ScheduleFields>, validés de la même façon partout. */
export const scheduleShape = {
  workDays: z.array(z.enum(WORK_DAYS)),
  startTime: z.string().regex(TIME, "Heure de début invalide.").optional(),
  endTime: z.string().regex(TIME, "Heure de fin invalide.").optional(),
  liveIn: z.boolean(),
};

type Schedule = { startTime?: string; endTime?: string; liveIn: boolean };

/**
 * Une fin avant le début n'est admise que si la personne dort sur place : c'est
 * alors un service de nuit (20h – 7h). Sans logement, c'est une inversion.
 */
export const scheduleOrderValid = (data: Schedule) =>
  data.liveIn || !data.startTime || !data.endTime || data.endTime > data.startTime;

export const SCHEDULE_ORDER_MESSAGE = "L'heure de fin doit être après l'heure de début.";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

export function readSchedule(formData: FormData) {
  return {
    workDays: sortWorkDays(formData.getAll("workDays").map(String)),
    startTime: optionalText(formData.get("startTime")),
    endTime: optionalText(formData.get("endTime")),
    liveIn: formData.get("liveIn") === "on",
  };
}

/** Les colonnes correspondantes, identiques dans `jobs` et `candidate_details`. */
export function scheduleColumns(data: {
  workDays: string[];
  startTime?: string;
  endTime?: string;
  liveIn: boolean;
}) {
  return {
    work_days: data.workDays,
    start_time: data.startTime ?? null,
    end_time: data.endTime ?? null,
    live_in: data.liveIn,
  };
}
