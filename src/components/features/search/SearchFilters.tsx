"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Loader2 } from "lucide-react";
import { WORK_DAYS, WORK_DAY_LABELS } from "@/lib/jobs/schedule";
import { RHYTHM_OPTIONS } from "@/lib/candidates/availability";

export type SearchFilterValues = {
  q: string;
  rayon: string;
  dispo: string;
  lat?: string;
  lng?: string;
  jours: string[];
  debut: string;
  fin: string;
  loge: boolean;
};

/**
 * A plain GET form: submitting reloads the page with the filters in the URL, so
 * results stay shareable and bookmarkable and the query runs on the server. The
 * only JavaScript here is the GPS button, which fills two hidden fields.
 */
export function SearchFilters({ values }: { values: SearchFilterValues }) {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [coords, setCoords] = useState<{ lat: string; lng: string } | null>(
    values.lat && values.lng ? { lat: values.lat, lng: values.lng } : null
  );

  const useMyPosition = () => {
    setGpsError("");
    if (!navigator.geolocation) {
      setGpsError("Géolocalisation non disponible sur cet appareil.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setCoords({ lat: String(latitude), lng: String(longitude) });
        setGpsLoading(false);
      },
      () => {
        setGpsError("Permission refusée.");
        setGpsLoading(false);
      }
    );
  };

  return (
    <form className="bg-card p-6 rounded-2xl shadow-sm border border-border sticky top-24">
      <h3 className="font-semibold text-lg mb-4">Filtres</h3>
      <div className="space-y-6">
        <div>
          <label htmlFor="q" className="text-sm font-medium mb-2 block">
            Métier, nom ou quartier
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input id="q" name="q" className="pl-9" placeholder="Ex: Nounou, Bacongo..." defaultValue={values.q} />
          </div>
        </div>

        {/* fieldset/legend, pas un label : « Point de départ » nomme un groupe
            — un bouton et deux champs cachés — et non une saisie. Un label sans
            champ associé n'est annoncé par aucun lecteur d'écran. */}
        <fieldset>
          <legend className="text-sm font-medium mb-2">Point de départ</legend>
          <p className="text-xs text-muted-foreground mb-2">
            {coords
              ? "Distances calculées depuis votre position."
              : "Par défaut, les distances partent de l'adresse de votre profil."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full text-xs h-8"
            onClick={useMyPosition}
            disabled={gpsLoading}
          >
            {gpsLoading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <MapPin className="mr-2 h-3 w-3" />}
            {coords ? "Position actualisée" : "Utiliser ma position GPS"}
          </Button>
          {gpsError && <p className="text-xs text-destructive mt-1">{gpsError}</p>}
          {coords && (
            <>
              <input type="hidden" name="lat" value={coords.lat} />
              <input type="hidden" name="lng" value={coords.lng} />
            </>
          )}
        </fieldset>

        <div>
          <label htmlFor="rayon" className="text-sm font-medium mb-2 block">
            Rayon (Distance)
          </label>
          <input
            id="rayon"
            name="rayon"
            type="range"
            className="w-full accent-primary"
            min="1"
            max="50"
            defaultValue={values.rayon || "50"}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1 km</span>
            <span>50 km</span>
          </div>
        </div>

        <div>
          <label htmlFor="dispo" className="text-sm font-medium mb-2 block">
            Disponibilité
          </label>
          <select
            id="dispo"
            name="dispo"
            defaultValue={values.dispo}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Toutes</option>
            {/* Le logement a sa propre case, « Dormir sur place », plus bas. */}
            {RHYTHM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="text-sm font-medium mb-2">Jours de service</legend>
          <div className="flex flex-wrap gap-1.5">
            {WORK_DAYS.map((day) => (
              <label
                key={day}
                className="cursor-pointer select-none rounded-full border border-input px-2.5 py-1 text-xs transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50"
              >
                <input
                  type="checkbox"
                  name="jours"
                  value={day}
                  defaultChecked={values.jours.includes(day)}
                  className="sr-only"
                />
                {WORK_DAY_LABELS[day].slice(0, 3)}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Candidats disponibles tous les jours cochés.
          </p>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="debut" className="text-sm font-medium mb-2 block">
              De
            </label>
            <Input id="debut" name="debut" type="time" defaultValue={values.debut} />
          </div>
          <div>
            <label htmlFor="fin" className="text-sm font-medium mb-2 block">
              À
            </label>
            <Input id="fin" name="fin" type="time" defaultValue={values.fin} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            name="loge"
            value="oui"
            defaultChecked={values.loge}
            className="h-4 w-4 accent-primary"
          />
          Dort sur place
        </label>

        <Button type="submit" className="w-full h-10">
          Appliquer les filtres
        </Button>
      </div>
    </form>
  );
}
