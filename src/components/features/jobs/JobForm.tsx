"use client";

import { Link } from "@/i18n/routing";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createJob, type JobFormState } from "@/lib/jobs/actions";
import { ScheduleFields } from "@/components/features/jobs/ScheduleFields";
import { JOB_PRICE } from "@/lib/jobs/payment";
import { formatPrice } from "@/lib/subscriptions/plans";

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

      <ScheduleFields
        daysLegend="Jours de service"
        liveInHint="L'employé est logé et passe la nuit chez vous."
      />

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

      <fieldset>
        <legend className="text-sm font-medium mb-2">Formule</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer gap-3 rounded-xl border border-input p-4 has-[:checked]:border-primary has-[:checked]:bg-accent">
            <input
              type="radio"
              name="formule"
              value="gratuite"
              defaultChecked
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block font-medium">Gratuite</span>
              <span className="block text-xs text-muted-foreground">
                Vous recevez le profil des candidats, sans leur numéro. Vous leur répondez par la
                messagerie.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-xl border border-input p-4 has-[:checked]:border-primary has-[:checked]:bg-accent">
            <input
              type="radio"
              name="formule"
              value="payante"
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block font-medium">Payante · {formatPrice(JOB_PRICE)}</span>
              <span className="block text-xs text-muted-foreground">
                Vous recevez le profil des candidats avec leur numéro de téléphone, pour les
                appeler directement. Une fois, pour toute la durée de l&apos;offre. Seuls les
                candidats qui ont renseigné un numéro en ont un à montrer.
              </span>
            </span>
          </label>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Avec l&apos;abonnement Premium Employeur, toutes vos offres sont payantes sans supplément.
        </p>
      </fieldset>

      <p className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
        Le numéro de téléphone de votre profil sera communiqué aux candidats Premium et à ceux
        qui le débloquent pour cette offre, pour qu&apos;ils puissent vous appeler directement.
      </p>

      {state.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
          {state.error}
          {state.missingPhone && (
            <>
              {" "}
              <Link href="/profil" className="font-semibold underline">
                Ajouter mon numéro
              </Link>
            </>
          )}
        </p>
      )}

      <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {pending ? "Publication..." : "Publier l'offre"}
      </Button>
    </form>
  );
}
