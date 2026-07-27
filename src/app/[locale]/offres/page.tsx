import { Briefcase, MapPin, Clock, Plus } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

type Job = {
  id: string;
  title: string;
  description: string;
  salary_range_min: number | null;
  salary_range_max: number | null;
  created_at: string;
  profiles: { full_name: string; is_premium: boolean } | null;
  neighborhoods: { name: string; cities: { name: string } | null } | null;
};

function formatSalary(min: number | null, max: number | null) {
  const format = (value: number) => new Intl.NumberFormat("fr-FR").format(value);
  if (min && max) return `${format(min)} – ${format(max)} FCFA / mois`;
  if (min) return `À partir de ${format(min)} FCFA / mois`;
  if (max) return `Jusqu'à ${format(max)} FCFA / mois`;
  return "Salaire à négocier";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export default async function JobsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  // The "Active jobs are viewable by everyone" policy already restricts this to
  // active postings (plus an employer's own), so no status filter is needed here.
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, title, description, salary_range_min, salary_range_max, created_at, " +
        "profiles(full_name, is_premium), neighborhoods(name, cities(name))"
    )
    .order("created_at", { ascending: false });

  const jobs = (data ?? []) as unknown as Job[];
  const canPost = user?.role === "employer" || user?.role === "admin";

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">Offres d&apos;emploi ({jobs.length})</h1>
            <p className="text-muted-foreground">
              Les postes proposés par les familles et employeurs de la plateforme.
            </p>
          </div>

          {canPost && (
            <Link href="/offres/creer" className={buttonVariants({ className: "rounded-full gap-2" })}>
              <Plus className="h-4 w-4" />
              Publier une offre
            </Link>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mb-6">
            Erreur de chargement : {error.message}
          </p>
        )}

        {!error && jobs.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">Aucune offre publiée pour le moment.</p>
            <p className="text-sm text-muted-foreground">
              {canPost
                ? "Publiez la première et recevez des candidatures."
                : "Revenez bientôt : de nouvelles offres sont publiées régulièrement."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => {
              const place = [job.neighborhoods?.name, job.neighborhoods?.cities?.name]
                .filter(Boolean)
                .join(", ");

              return (
                <article
                  key={job.id}
                  className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h2 className="text-lg font-bold">{job.title}</h2>
                    {job.profiles?.is_premium && (
                      <Badge className="bg-secondary text-secondary-foreground font-normal shrink-0">
                        Premium
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3 whitespace-pre-line">
                    {job.description}
                  </p>

                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 text-primary font-medium">
                      {formatSalary(job.salary_range_min, job.salary_range_max)}
                    </span>
                    {place && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {place}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Publiée le {formatDate(job.created_at)}
                    </span>
                    {/* Employers awaiting moderation are invisible under the
                        profiles policy, so the embed can legitimately be null. */}
                    <span>{job.profiles?.full_name ?? "Employeur particulier"}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
