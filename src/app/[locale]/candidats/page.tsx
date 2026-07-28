import { SearchX } from "lucide-react";
import { SearchFilters } from "@/components/features/search/SearchFilters";
import { ProfileCard } from "@/components/features/search/ProfileCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import banniere from "@/assets/images/banniere-candidats.jpg";

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

/** Shown instead of a 500 when a deploy is missing its Supabase credentials. */
const MISCONFIGURED =
  "Service temporairement indisponible : la connexion à la base de données n'est pas configurée sur ce déploiement.";

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

  // Only validated profiles come back: search_candidates runs as SECURITY
  // INVOKER, so the RLS policy on `profiles` filters the rows, not this page.
  const { data, error } = isSupabaseConfigured()
    ? await (
        await createClient()
      ).rpc("search_candidates", {
        origin_lat: toNumber(params.lat) ?? null,
        origin_lng: toNumber(params.lng) ?? null,
        max_km: toNumber(params.rayon) ?? null,
        search: params.q ?? null,
        availability_filter: params.dispo ?? null,
      })
    : { data: null, error: { message: MISCONFIGURED } };

  const candidates = (data ?? []) as Candidate[];

  return (
    <>
      <PageHeader
        eyebrow="Recherche"
        title="Trouvez la personne qu'il vous faut."
        description="Chaque profil affiché a passé la vérification de dossier. Filtrez par métier, disponibilité et distance depuis chez vous."
        image={banniere}
      />

      <div className="bg-surface bg-grain py-10 sm:py-14 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row gap-8">
          <aside className="w-full md:w-1/3 lg:w-1/4 md:sticky md:top-24 md:self-start">
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
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold">
                {candidates.length} candidat{candidates.length > 1 ? "s" : ""} disponible
                {candidates.length > 1 ? "s" : ""}
              </h2>
              <p className="text-sm text-muted-foreground">
                Profils premium en premier, puis les plus proches.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mb-6">
                Erreur de chargement : {error.message}
              </p>
            )}

            {!error && candidates.length === 0 ? (
              <div className="bg-card border border-border rounded-3xl p-12 text-center shadow-soft">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-primary">
                  <SearchX className="h-6 w-6" />
                </span>
                <p className="font-bold text-lg mb-1">Aucun candidat ne correspond.</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
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
    </>
  );
}
