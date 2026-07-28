import { Briefcase, MapPin, Clock, Plus, Wallet } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import famille from "@/assets/images/famille-cuisine.jpg";

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
    <>
      <PageHeader
        eyebrow="Offres d'emploi"
        title={`${jobs.length} poste${jobs.length > 1 ? "s" : ""} à pourvoir`}
        description="Les postes proposés par les familles et employeurs de la plateforme. Candidatez directement depuis votre espace."
        image={famille}
      >
        {canPost && (
          <Link
            href="/offres/creer"
            className={buttonVariants({
              size: "lg",
              className: "h-12 px-6 rounded-full gap-2",
            })}
          >
            <Plus className="h-4 w-4" />
            Publier une offre
          </Link>
        )}
      </PageHeader>

      <div className="bg-surface bg-grain py-10 sm:py-14 flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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
                  className="group relative bg-card border border-border rounded-3xl p-6 sm:p-7 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all duration-300"
                >
                  {/* Gold rail on premium listings, so they read at a glance. */}
                  {job.profiles?.is_premium && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-6 bottom-6 w-1 rounded-r-full bg-secondary"
                    />
                  )}

                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h2 className="text-xl font-bold leading-snug">{job.title}</h2>
                    {job.profiles?.is_premium && (
                      <Badge className="bg-secondary text-secondary-foreground font-semibold shrink-0">
                        Premium
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mb-5 line-clamp-3 whitespace-pre-line leading-relaxed">
                    {job.description}
                  </p>

                  <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-primary">
                    <Wallet className="h-4 w-4" aria-hidden />
                    {formatSalary(job.salary_range_min, job.salary_range_max)}
                  </p>

                  <div className="mt-5 pt-4 border-t border-border flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    {place && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {place}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
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
    </>
  );
}
