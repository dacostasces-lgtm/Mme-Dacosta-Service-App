"use client";

import { useActionState, useState } from "react";
import { Briefcase, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeOnboarding, type OnboardingState } from "@/lib/auth/onboarding";
import { normalisePhone } from "@/lib/phone";
import { submitWithoutReset } from "@/lib/forms";
import type { CityRef } from "@/lib/geo/locations";
import { NeighborhoodFields, PhoneField } from "./ContactFields";

const CHOIX = [
  {
    valeur: "employer",
    titre: "Je recrute",
    detail: "Publier une offre et contacter des candidates.",
    Icone: Briefcase,
  },
  {
    valeur: "candidate",
    titre: "Je cherche un emploi",
    detail: "Créer mon profil et postuler aux offres.",
    Icone: Search,
  },
] as const;

/**
 * La dernière étape d'un compte créé avec Google : le rôle, puis le numéro et
 * le quartier.
 *
 * Deux cartes plutôt qu'un menu déroulant pour le rôle : c'est la question qui
 * décide de tout le reste. Le numéro et le quartier sont obligatoires depuis le
 * 26 novembre 2026 — Google ne les donne pas, et des employeurs arrivaient
 * ainsi sans numéro, alors que le formulaire d'inscription l'exige. Le bouton
 * reste grisé tant qu'il en manque un.
 */
export function OnboardingRoleForm({ cities }: { cities: CityRef[] }) {
  const [role, setRole] = useState<"employer" | "candidate" | null>(null);
  const [phone, setPhone] = useState("");
  // Brazzaville d'abord : la ville du lancement, et l'essentiel du trafic.
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {}
  );

  const complete = Boolean(role) && normalisePhone(phone).ok && Boolean(neighborhoodId);

  return (
    // Sans remise à zéro : après un refus (numéro déjà pris…), le quartier
    // revenait vide à l'écran alors que le bouton le croyait choisi.
    <form action={formAction} onSubmit={submitWithoutReset(formAction)} className="space-y-5">
      <input type="hidden" name="role" value={role ?? ""} />

      <fieldset disabled={pending} className="space-y-3">
        <legend className="sr-only">Que venez-vous faire sur Madame Dacosta ?</legend>

        {CHOIX.map(({ valeur, titre, detail, Icone }) => (
          <label
            key={valeur}
            className={`flex items-start gap-4 p-4 border rounded-2xl cursor-pointer transition-all ${
              role === valeur
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40"
            }`}
          >
            <input
              type="radio"
              name="choix"
              value={valeur}
              className="sr-only"
              checked={role === valeur}
              onChange={() => setRole(valeur)}
            />
            <span
              className={`h-10 w-10 rounded-full grid place-items-center shrink-0 ${
                role === valeur ? "bg-primary text-primary-foreground" : "bg-accent text-primary"
              }`}
            >
              <Icone className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="font-semibold block">{titre}</span>
              <span className="text-sm text-muted-foreground">{detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {role && (
        <fieldset disabled={pending} className="space-y-4">
          <legend className="sr-only">Vos coordonnées</legend>
          <PhoneField value={phone} onChange={setPhone} />
          <NeighborhoodFields
            cities={cities}
            cityId={cityId}
            onCityChange={setCityId}
            neighborhoodId={neighborhoodId}
            onNeighborhoodChange={setNeighborhoodId}
          />
        </fieldset>
      )}

      {state.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{state.error}</p>
      )}

      <Button
        type="submit"
        className="w-full h-12 text-base font-semibold rounded-full"
        disabled={pending || !complete}
      >
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {pending ? "Enregistrement..." : "Continuer"}
      </Button>
      {!complete && (
        <p className="text-xs text-muted-foreground text-center">
          {!role
            ? "Choisissez d'abord l'une des deux réponses."
            : "Indiquez votre numéro et votre quartier pour continuer."}
        </p>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Ce choix ne se change pas ensuite : vos offres et vos candidatures y sont
        rattachées. Écrivez-nous si vous vous êtes trompé.
      </p>
    </form>
  );
}
