import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type NeighborhoodRef = { id: string; name: string };
export type CityRef = {
  id: string;
  name: string;
  country: string;
  neighborhoods: NeighborhoodRef[];
};

/**
 * The seeded location reference list: cities with their arrondissements.
 *
 * Read from the database rather than hardcoded in the bundle so the seed
 * migration stays the single source of truth — a quartier added there shows up
 * in the forms without a deploy. `cache()` keeps it to one round-trip per render.
 *
 * Both tables are world-readable (`GRANT SELECT ... TO anon`), so this works on
 * the signup page where there is no session yet.
 */
export const getLocations = cache(async (): Promise<CityRef[]> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cities")
    .select("id, name, country, neighborhoods(id, name)")
    .order("name");

  if (error || !data) return [];

  return (data as unknown as CityRef[])
    .map((city) => ({
      ...city,
      neighborhoods: [...(city.neighborhoods ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "fr")
      ),
    }))
    // A city with no quartier yet would render an empty second menu, which reads
    // as a broken form rather than an incomplete reference list.
    .filter((city) => city.neighborhoods.length > 0);
});
