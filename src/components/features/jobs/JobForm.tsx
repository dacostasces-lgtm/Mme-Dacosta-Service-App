"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createJob, type JobFormState } from "@/lib/jobs/actions";
import { WORK_DAYS, WORK_DAY_LABELS } from "@/lib/jobs/schedule";

export type NeighborhoodOption = { id: string; label: string };

export function JobForm({ neighborhoods }: { neighborhoods: NeighborhoodOption[] }) {
  const [state, formAction, pending] = useActionState<JobFormState, FormData>(createJob, {});

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="title" className="text-sm font-medium mb-1 block">
          Intitulé du poste
        </label>
        <Input id="title" name="title" placeholder="Ex: Nounou à temps plein" required />
      </div>

      <div>
        <label htmlFor="description" className="text-sm font-medium mb-1 block">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={6}
          required
          placeholder="Tâches attendues, nombre d'enfants, contraintes particulières..."
          className="w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="salaryMin" className="text-sm font-medium mb-1 block">
            Salaire minimum <span className="text-muted-foreground font-normal">(FCFA)</span>
          </label>
          <Input id="salaryMin" name="salaryMin" type="number" min="0" step="1000" placeholder="80000" />
        </div>
        <div>
          <label htmlFor="salaryMax" className="text-sm font-medium mb-1 block">
            Salaire maximum <span className="text-muted-foreground font-normal">(FCFA)</span>
          </label>
          <Input id="salaryMax" name="salaryMax" type="number" min="0" step="1000" placeholder="120000" />
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium mb-2">Jours de service</legend>
        <div className="flex flex-wrap gap-2">
          {WORK_DAYS.map((day) => (
            <label
              key={day}
              className="cursor-pointer select-none rounded-full border border-input px-3 py-1.5 text-sm transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50"
            >
              <input type="checkbox" name="workDays" value={day} className="sr-only" />
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
          <Input id="startTime" name="startTime" type="time" />
        </div>
        <div>
          <label htmlFor="endTime" className="text-sm font-medium mb-1 block">
            Heure de fin
          </label>
          <Input id="endTime" name="endTime" type="time" />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-input p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-accent">
        <input type="checkbox" name="liveIn" className="mt-0.5 h-4 w-4 accent-primary" />
        <span>
          <span className="text-sm font-medium block">Dormir sur place</span>
          <span className="text-xs text-muted-foreground">
            L&apos;employé est logé et passe la nuit chez vous.
          </span>
        </span>
      </label>

      <div>
        <label htmlFor="neighborhoodId" className="text-sm font-medium mb-1 block">
          Quartier
        </label>
        <select
          id="neighborhoodId"
          name="neighborhoodId"
          defaultValue=""
          className="w-full h-12 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Non précisé</option>
          {neighborhoods.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {neighborhoods.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Aucun quartier enregistré pour l&apos;instant. Ils se créent au fur et à mesure des
            inscriptions.
          </p>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{state.error}</p>
      )}

      <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {pending ? "Publication..." : "Publier l'offre"}
      </Button>
    </form>
  );
}
