"use client";

import { Input } from "@/components/ui/input";
import { normalisePhone, PHONE_HINT } from "@/lib/phone";
import type { CityRef } from "@/lib/geo/locations";

const SELECT =
  "w-full h-12 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

/**
 * Le numéro, tel que le demandent les étapes qui suivent la connexion :
 * /bienvenue (compte créé avec Google) et /coordonnees (employeur inscrit
 * avant que le numéro soit obligatoire). Contrôlé par le formulaire qui le
 * porte, lequel grise son bouton tant que le numéro n'est pas valable.
 */
export function PhoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = normalisePhone(value);

  return (
    <div>
      <label htmlFor="phone" className="text-sm font-medium mb-1 block">
        Téléphone
      </label>
      <Input
        id="phone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="06 717 30 30"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p
        className={`text-xs mt-1 ${
          value.trim() !== "" && !parsed.ok ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {value.trim() !== "" && !parsed.ok
          ? parsed.reason
          : `${PHONE_HINT}. Un code vous sera envoyé par SMS pour le vérifier.`}
      </p>
    </div>
  );
}

/** La ville puis le quartier, pour les mêmes étapes que PhoneField. */
export function NeighborhoodFields({
  cities,
  cityId,
  onCityChange,
  neighborhoodId,
  onNeighborhoodChange,
}: {
  cities: CityRef[];
  cityId: string;
  onCityChange: (cityId: string) => void;
  neighborhoodId: string;
  onNeighborhoodChange: (neighborhoodId: string) => void;
}) {
  if (cities.length === 0) {
    return (
      <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
        La liste des quartiers n&apos;a pas pu être chargée. Rechargez la page ou réessayez
        dans un instant.
      </p>
    );
  }

  const selectedCity = cities.find((city) => city.id === cityId) ?? cities[0];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label htmlFor="cityId" className="text-sm font-medium mb-1 block">
          Ville
        </label>
        <select
          id="cityId"
          className={SELECT}
          value={cityId}
          onChange={(event) => {
            onCityChange(event.target.value);
            // Un quartier de l'ancienne ville ne va pas avec la nouvelle.
            onNeighborhoodChange("");
          }}
        >
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="neighborhoodId" className="text-sm font-medium mb-1 block">
          Quartier
        </label>
        <select
          id="neighborhoodId"
          name="neighborhoodId"
          className={SELECT}
          required
          value={neighborhoodId}
          onChange={(event) => onNeighborhoodChange(event.target.value)}
        >
          <option value="">Choisir…</option>
          {(selectedCity?.neighborhoods ?? []).map((quartier) => (
            <option key={quartier.id} value={quartier.id}>
              {quartier.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
