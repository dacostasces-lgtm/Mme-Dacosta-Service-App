"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/routing";
import { createCandidate, type NewCandidateState } from "@/lib/admin/candidates";
import { AVAILABILITY_OPTIONS } from "@/lib/candidates/availability";
import { PHONE_HINT } from "@/lib/phone";
import type { CityRef } from "@/lib/geo/locations";

const FIELD =
  "w-full h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Label({ htmlFor, children, hint }: { htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium mb-1.5 block">
      {children}
      {hint && <span className="block text-xs font-normal text-muted-foreground mt-0.5">{hint}</span>}
    </label>
  );
}

export function NewCandidateForm({ cities }: { cities: CityRef[] }) {
  const [state, formAction, pending] = useActionState<NewCandidateState, FormData>(
    createCandidate,
    {}
  );
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const city = cities.find((c) => c.id === cityId) ?? cities[0];

  if (state.profileId) {
    return (
      <div className="bg-card border border-border rounded-3xl shadow-soft p-8 text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-green-500/10 text-green-700 dark:text-green-500">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h2 className="text-xl font-bold mb-2">{state.fullName} est en ligne</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          La fiche est publiée et apparaît dès maintenant dans la recherche. Le candidat
          pourra la reprendre en main depuis « mot de passe oublié » : il recevra un code
          par SMS sur le numéro que vous avez saisi.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={`/candidats/${state.profileId}`}
            className={buttonVariants({ className: "h-11 rounded-full px-6" })}
          >
            Voir la fiche
          </Link>
          {/* Recharge la page, donc un formulaire vide : l'usage courant est
              d'en saisir plusieurs à la suite. */}
          <a
            href=""
            className={buttonVariants({
              variant: "outline",
              className: "h-11 rounded-full px-6",
            })}
          >
            Ajouter un autre candidat
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-8">
      <section className="bg-card border border-border rounded-3xl shadow-soft p-6 sm:p-7">
        <h2 className="font-semibold mb-5">Identité</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2">
            <Label htmlFor="fullName">Nom complet</Label>
            <Input id="fullName" name="fullName" required maxLength={120} placeholder="Ex : Clarisse Mabiala" />
          </div>

          <div>
            <Label htmlFor="phone" hint={PHONE_HINT}>Téléphone</Label>
            <Input id="phone" name="phone" required inputMode="tel" placeholder="06 717 30 30" />
          </div>

          <div>
            <Label htmlFor="email" hint="Facultatif. Beaucoup n'en ont pas.">Email</Label>
            <Input id="email" name="email" type="email" placeholder="facultatif" />
          </div>

          <div>
            <Label htmlFor="cityId">Ville</Label>
            <select
              id="cityId"
              className={FIELD}
              value={cityId}
              onChange={(event) => setCityId(event.target.value)}
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="neighborhoodId">Quartier</Label>
            <select id="neighborhoodId" name="neighborhoodId" required className={FIELD}>
              {city?.neighborhoods.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="bg-card border border-border rounded-3xl shadow-soft p-6 sm:p-7">
        <h2 className="font-semibold mb-5">Métier</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="jobTitle">Métier</Label>
            <Input id="jobTitle" name="jobTitle" required maxLength={80} placeholder="Ex : Nounou expérimentée" />
          </div>

          <div>
            <Label htmlFor="experience" hint="Texte libre : « 5 ans », « depuis 2019 »">Expérience</Label>
            <Input id="experience" name="experience" maxLength={60} placeholder="Ex : 5 ans" />
          </div>

          <div>
            <Label htmlFor="availability">Disponibilité</Label>
            <select id="availability" name="availability" className={FIELD} defaultValue="full_time">
              {AVAILABILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="desiredSalary" hint="En FCFA par mois. Facultatif.">Salaire souhaité</Label>
            <Input id="desiredSalary" name="desiredSalary" type="number" min={0} step={1000} placeholder="Ex : 80000" />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="languages" hint="Séparées par des virgules">Langues parlées</Label>
            <Input id="languages" name="languages" maxLength={200} placeholder="Français, lingala, kituba" />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="skills" hint="Séparées par des virgules">Compétences</Label>
            <Input id="skills" name="skills" maxLength={400} placeholder="Repassage, cuisine congolaise, garde de nourrisson" />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="description" hint="Ce que vous diriez d'elle ou de lui à une famille.">Présentation</Label>
            <textarea
              id="description"
              name="description"
              rows={5}
              maxLength={2000}
              className={`${FIELD} h-auto py-2.5 leading-relaxed`}
              placeholder="Douze ans d'expérience auprès de familles à Brazzaville, références vérifiées…"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="photo" hint="Fortement recommandée : une fiche sans visage est rarement contactée.">
              Photo
            </Label>
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-accent/70"
            />
          </div>
        </div>
      </section>

      {state.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{state.error}</p>
      )}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending} className="h-12 rounded-full px-8 gap-2">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Publier le profil
        </Button>
        <p className="text-sm text-muted-foreground">
          Le profil est visible dans la recherche dès l&apos;enregistrement.
        </p>
      </div>
    </form>
  );
}
