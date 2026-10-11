import { Input } from "@/components/ui/input";
import { WORK_DAYS, WORK_DAY_LABELS } from "@/lib/jobs/schedule";

/** Postgres renvoie « 08:00:00 », un <input type="time"> attend « 08:00 ». */
function toInputTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}

/**
 * Jours, horaires et « dormir sur place » : les mêmes champs, avec les mêmes
 * noms, pour une offre et pour un profil candidat. Les actions les lisent avec
 * `readSchedule` (src/lib/jobs/schedule-form.ts).
 */
export function ScheduleFields({
  daysLegend,
  liveInHint,
  defaults,
  required = false,
}: {
  daysLegend: string;
  /** Heures obligatoires (profil candidat). Les jours, eux, sont vérifiés par
   *  l'action : le navigateur ne sait pas exiger « au moins une case ». */
  required?: boolean;
  liveInHint: string;
  defaults?: {
    workDays?: string[] | null;
    startTime?: string | null;
    endTime?: string | null;
    liveIn?: boolean | null;
  };
}) {
  return (
    <>
      <fieldset>
        <legend className="text-sm font-medium mb-2">{daysLegend}</legend>
        <div className="flex flex-wrap gap-2">
          {WORK_DAYS.map((day) => (
            <label
              key={day}
              className="cursor-pointer select-none rounded-full border border-input px-3 py-1.5 text-sm transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50"
            >
              <input
                type="checkbox"
                name="workDays"
                value={day}
                defaultChecked={defaults?.workDays?.includes(day)}
                className="sr-only"
              />
              {WORK_DAY_LABELS[day]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="startTime" className="text-sm font-medium mb-1 block">
            Heure de début
          </label>
          <Input
            id="startTime"
            name="startTime"
            type="time"
            required={required}
            defaultValue={toInputTime(defaults?.startTime)}
          />
        </div>
        <div>
          <label htmlFor="endTime" className="text-sm font-medium mb-1 block">
            Heure de fin
          </label>
          <Input
            id="endTime"
            name="endTime"
            type="time"
            required={required}
            defaultValue={toInputTime(defaults?.endTime)}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-input p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-accent">
        <input
          type="checkbox"
          name="liveIn"
          defaultChecked={Boolean(defaults?.liveIn)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span>
          <span className="text-sm font-medium block">Dormir sur place</span>
          <span className="text-xs text-muted-foreground">{liveInHint}</span>
        </span>
      </label>
    </>
  );
}
