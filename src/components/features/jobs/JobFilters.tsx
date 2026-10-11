import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WORK_DAYS, WORK_DAY_LABELS, type WorkDay } from "@/lib/jobs/schedule";

export type JobFilterValues = {
  jours: WorkDay[];
  debut: string;
  fin: string;
  loge: "" | "oui" | "non";
};

/**
 * Formulaire GET, comme la recherche de candidats : les filtres vivent dans
 * l'URL, la requête s'exécute sur le serveur, et rien ici n'a besoin de
 * JavaScript.
 */
export function JobFilters({ values, active }: { values: JobFilterValues; active: boolean }) {
  return (
    <form className="bg-card border border-border rounded-3xl p-5 sm:p-6 shadow-soft mb-6 space-y-5">
      <fieldset>
        <legend className="text-sm font-medium mb-2">Jours où vous êtes disponible</legend>
        <div className="flex flex-wrap gap-2">
          {WORK_DAYS.map((day) => (
            <label
              key={day}
              className="cursor-pointer select-none rounded-full border border-input px-3 py-1.5 text-sm transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50"
            >
              <input
                type="checkbox"
                name="jours"
                value={day}
                defaultChecked={values.jours.includes(day)}
                className="sr-only"
              />
              {WORK_DAY_LABELS[day]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Seules les offres dont tous les jours de service sont cochés s&apos;affichent.
        </p>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="debut" className="text-sm font-medium mb-1 block">
            Commencer pas avant
          </label>
          <Input id="debut" name="debut" type="time" defaultValue={values.debut} />
        </div>
        <div>
          <label htmlFor="fin" className="text-sm font-medium mb-1 block">
            Finir au plus tard
          </label>
          <Input id="fin" name="fin" type="time" defaultValue={values.fin} />
        </div>
        <div>
          <label htmlFor="loge" className="text-sm font-medium mb-1 block">
            Dormir sur place
          </label>
          <select
            id="loge"
            name="loge"
            defaultValue={values.loge}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Indifférent</option>
            <option value="oui">Oui, logé sur place</option>
            <option value="non">Non, je rentre chez moi</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-10 px-6 rounded-full">
          Rechercher
        </Button>
        {active && (
          <Link href="/offres" className="text-sm text-muted-foreground hover:text-foreground">
            Effacer les filtres
          </Link>
        )}
      </div>
    </form>
  );
}
