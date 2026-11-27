"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeAccount, type CompleteAccountState } from "@/lib/profile/complete-account";
import { normalisePhone } from "@/lib/phone";
import { submitWithoutReset } from "@/lib/forms";
import type { CityRef } from "@/lib/geo/locations";
import { NeighborhoodFields, PhoneField } from "./ContactFields";

/**
 * Le numéro et le quartier d'un employeur inscrit avant qu'ils soient
 * obligatoires, ou celui des deux qui manque. Le bouton reste grisé tant
 * que ce qui est demandé n'est pas rempli, comme à l'inscription.
 */
export function CompleteAccountForm({
  needsPhone,
  needsNeighborhood,
  cities,
}: {
  needsPhone: boolean;
  needsNeighborhood: boolean;
  cities: CityRef[];
}) {
  const [phone, setPhone] = useState("");
  // Brazzaville d'abord : la ville du lancement, et l'essentiel du trafic.
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [state, formAction, pending] = useActionState<CompleteAccountState, FormData>(
    completeAccount,
    {}
  );

  const complete =
    (!needsPhone || normalisePhone(phone).ok) && (!needsNeighborhood || Boolean(neighborhoodId));

  return (
    // Sans remise à zéro : après un refus (numéro déjà pris…), le quartier
    // revenait vide à l'écran alors que le bouton le croyait choisi.
    <form action={formAction} onSubmit={submitWithoutReset(formAction)} className="space-y-5">
      <fieldset disabled={pending} className="space-y-4">
        <legend className="sr-only">Vos coordonnées</legend>
        {needsPhone && <PhoneField value={phone} onChange={setPhone} />}
        {needsNeighborhood && (
          <NeighborhoodFields
            cities={cities}
            cityId={cityId}
            onCityChange={setCityId}
            neighborhoodId={neighborhoodId}
            onNeighborhoodChange={setNeighborhoodId}
          />
        )}
      </fieldset>

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
          {needsPhone && needsNeighborhood
            ? "Indiquez votre numéro et votre quartier pour continuer."
            : needsPhone
              ? "Indiquez votre numéro pour continuer."
              : "Choisissez votre quartier pour continuer."}
        </p>
      )}
    </form>
  );
}
