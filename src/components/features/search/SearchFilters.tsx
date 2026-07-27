"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Loader2 } from "lucide-react";

export type SearchFilterValues = {
  q: string;
  rayon: string;
  dispo: string;
  lat?: string;
  lng?: string;
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

        <div>
          <label className="text-sm font-medium mb-2 block">Point de départ</label>
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
        </div>

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
            <option value="full_time">Temps Plein</option>
            <option value="part_time">Temps Partiel</option>
            <option value="internal">Interne (Logé)</option>
            <option value="external">Externe</option>
          </select>
        </div>

        <Button type="submit" className="w-full h-10">
          Appliquer les filtres
        </Button>
      </div>
    </form>
  );
}
