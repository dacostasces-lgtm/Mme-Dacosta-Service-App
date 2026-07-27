import { SearchFilters } from "@/components/features/search/SearchFilters";
import { ProfileCard } from "@/components/features/search/ProfileCard";
import { createClient } from "@/lib/supabase/server";

type Candidate = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  is_premium: boolean;
  neighborhood: string | null;
  city: string | null;
  job_title: string | null;
  availability: string | null;
  distance_km: number | null;
  rating: number | string | null;
};

const AVAILABILITY_LABELS: Record<string, string> = {
  full_time: "Temps Plein",
  part_time: "Temps Partiel",
  internal: "Interne (Logé)",
  external: "Externe",
};

function toNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rayon?: string; dispo?: string; lat?: string; lng?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Only validated profiles come back: search_candidates runs as SECURITY
  // INVOKER, so the RLS policy on `profiles` filters the rows, not this page.
  const { data, error } = await supabase.rpc("search_candidates", {
    origin_lat: toNumber(params.lat) ?? null,
    origin_lng: toNumber(params.lng) ?? null,
    max_km: toNumber(params.rayon) ?? null,
    search: params.q ?? null,
    availability_filter: params.dispo ?? null,
  });

  const candidates = (data ?? []) as Candidate[];

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row gap-8">
          <aside className="w-full md:w-1/3 lg:w-1/4">
            <SearchFilters
              values={{
                q: params.q ?? "",
                rayon: params.rayon ?? "",
                dispo: params.dispo ?? "",
                lat: params.lat,
                lng: params.lng,
              }}
            />
          </aside>

          <main className="w-full md:w-2/3 lg:w-3/4">
            <div className="mb-6">
              <h1 className="text-2xl font-bold">
                Candidats disponibles ({candidates.length})
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Les profils premium apparaissent en premier, puis les plus proches de vous.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mb-6">
                Erreur de chargement : {error.message}
              </p>
            )}

            {!error && candidates.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-10 text-center">
                <p className="font-medium mb-1">Aucun candidat ne correspond.</p>
                <p className="text-sm text-muted-foreground">
                  Élargissez le rayon ou effacez les filtres. Les nouveaux profils apparaissent
                  ici une fois leur dossier vérifié.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {candidates.map((candidate) => (
                  <ProfileCard
                    key={candidate.id}
                    id={candidate.id}
                    name={candidate.full_name}
                    jobTitle={candidate.job_title ?? "Profil en cours de complétion"}
                    neighborhood={
                      [candidate.neighborhood, candidate.city].filter(Boolean).join(", ") ||
                      "Localisation non précisée"
                    }
                    distance={candidate.distance_km ?? undefined}
                    rating={Number(candidate.rating ?? 0)}
                    isPremium={candidate.is_premium}
                    availability={
                      AVAILABILITY_LABELS[candidate.availability ?? ""] ?? "À préciser"
                    }
                    avatarUrl={candidate.avatar_url ?? undefined}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
