import { BedDouble, Briefcase, CalendarDays, MapPin, Clock, Plus, Timer, Wallet, Send } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { ApplyButton } from "@/components/features/jobs/ApplyButton";
import { EmployerContact } from "@/components/features/contact/EmployerContact";
import { ShareButton } from "@/components/shared/ShareButton";
import { localisedUrl } from "@/lib/site";
import { JobFilters, type JobFilterValues } from "@/components/features/jobs/JobFilters";
import { formatSalary, formatShortDate } from "@/lib/jobs/format";
import { formatHours, formatWorkDays, isWorkDay, sortWorkDays } from "@/lib/jobs/schedule";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import famille from "@/assets/images/famille-cuisine.jpg";

type Job = {
  id: string;
  title: string;
  description: string;
  salary_range_min: number | null;
  salary_range_max: number | null;
  created_at: string;
  work_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  live_in: boolean;
  expires_at: string;
  employer_id: string;
  profiles: { full_name: string; is_premium: boolean } | null;
  neighborhoods: { name: string; cities: { name: string } | null } | null;
};

/** Shown instead of a 500 when a deploy is missing its Supabase credentials. */
const MISCONFIGURED =
  "Service temporairement indisponible : la connexion à la base de données n'est pas configurée sur ce déploiement.";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ce qui arrive de l'URL est tapé à la main autant que soumis : on trie. */
function readFilters(params: {
  jours?: string | string[];
  debut?: string;
  fin?: string;
  loge?: string;
}): JobFilterValues {
  const jours = ([] as string[]).concat(params.jours ?? []).filter(isWorkDay);
  return {
    jours: sortWorkDays(jours),
    debut: params.debut && TIME.test(params.debut) ? params.debut : "",
    fin: params.fin && TIME.test(params.fin) ? params.fin : "",
    loge: params.loge === "oui" || params.loge === "non" ? params.loge : "",
  };
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ jours?: string | string[]; debut?: string; fin?: string; loge?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const filters = readFilters(params);
  const filtering = Boolean(
    filters.jours.length || filters.debut || filters.fin || filters.loge
  );

  // The "Active jobs are viewable by everyone" policy already restricts this to
  // active postings (plus an employer's own), so no status filter is needed here.
  let query = isSupabaseConfigured()
    ? (await createClient())
        .from("jobs")
        .select(
          "id, title, description, salary_range_min, salary_range_max, created_at, " +
            "work_days, start_time, end_time, live_in, expires_at, employer_id, " +
            "profiles(full_name, is_premium), neighborhoods(name, cities(name))"
        )
        // La politique de lecture montre aussi à un employeur ses propres
        // offres pourvues ou expirées. Elles se gèrent depuis son tableau de
        // bord ; la liste publique ne montre que ce qui est disponible.
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
    : null;

  if (query) {
    // Une offre convient si tous ses jours font partie de ceux cochés. Une offre
    // sans jour précisé reste visible : rien ne dit qu'elle ne convient pas.
    if (filters.jours.length) query = query.containedBy("work_days", filters.jours);

    // Même logique pour les heures : non précisée, l'offre n'est pas écartée.
    // Les heures sont entre guillemets, le « : » étant réservé dans la syntaxe
    // des filtres logiques de PostgREST.
    const hours: string[] = [];
    if (filters.debut) hours.push(`or(start_time.is.null,start_time.gte."${filters.debut}")`);
    if (filters.fin) hours.push(`or(end_time.is.null,end_time.lte."${filters.fin}")`);
    if (hours.length) query = query.or(`and(${hours.join(",")})`);

    if (filters.loge) query = query.eq("live_in", filters.loge === "oui");
  }

  const { data, error } = query
    ? await query
    : { data: null, error: { message: MISCONFIGURED } };

  const jobs = (data ?? []) as unknown as Job[];
  const canPost = user?.role === "employer" || user?.role === "admin";
  const canApply = user?.role === "candidate";

  // Which of these the candidate already answered, so the card says so instead
  // of offering a button that can only fail on the UNIQUE constraint.
  let appliedTo = new Set<string>();
  if (canApply && user.profileId) {
    const { data: mine } = await (await createClient())
      .from("applications")
      .select("job_id")
      .eq("candidate_id", user.profileId);
    appliedTo = new Set((mine ?? []).map((row) => row.job_id as string));
  }

  return (
    <>
      <PageHeader
        eyebrow="Offres d'emploi"
        title={`${jobs.length} poste${jobs.length > 1 ? "s" : ""} ${
          filtering ? (jobs.length > 1 ? "correspondent" : "correspond") : "à pourvoir"
        }`}
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
        <JobFilters values={filters} active={filtering} />

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mb-6">
            Erreur de chargement : {error.message}
          </p>
        )}

        {!error && jobs.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">
              {filtering
                ? "Aucune offre ne correspond à ces critères."
                : "Aucune offre publiée pour le moment."}
            </p>
            <p className="text-sm text-muted-foreground">
              {filtering
                ? "Cochez plus de jours ou élargissez les horaires."
                : canPost
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
              const days = formatWorkDays(job.work_days);
              const hours = formatHours(job.start_time, job.end_time);

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
                    <h2 className="text-xl font-bold leading-snug">
                      {/* Deliberately not a stretched link: the card also holds
                          the apply form, and an `after:inset-0` overlay would
                          paint over it and swallow the button's clicks. */}
                      <Link
                        href={`/offres/${job.id}`}
                        className="hover:text-primary transition-colors"
                      >
                        {job.title}
                      </Link>
                    </h2>
                    {job.profiles?.is_premium && (
                      <Badge className="bg-secondary text-secondary-foreground font-semibold shrink-0">
                        Premium
                      </Badge>
                    )}
                  </div>

                  {/* Pas de description ici : elle se lit sur la page de
                      l'offre. La carte reste courte et la liste se parcourt
                      d'un coup d'œil. */}
                  <div className="mb-5" />

                  <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-primary">
                    <Wallet className="h-4 w-4" aria-hidden />
                    {formatSalary(job.salary_range_min, job.salary_range_max)}
                  </p>

                  {(days || hours || job.live_in) && (
                    <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                      {days && (
                        <li className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
                          {days}
                        </li>
                      )}
                      {hours && (
                        <li className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
                          <Timer className="h-4 w-4 text-muted-foreground" aria-hidden />
                          {hours}
                        </li>
                      )}
                      {job.live_in && (
                        <li className="inline-flex items-center gap-1.5 rounded-full bg-secondary/20 px-3 py-1 font-medium">
                          <BedDouble className="h-4 w-4" aria-hidden />
                          Dort sur place
                        </li>
                      )}
                    </ul>
                  )}

                  <div className="mt-5 pt-4 border-t border-border flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    {place && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {place}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      Publiée le {formatShortDate(job.created_at)}
                    </span>
                    <span className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
                      Disponible jusqu&apos;au {formatShortDate(job.expires_at)}
                    </span>
                    {/* Employers awaiting moderation are invisible under the
                        profiles policy, so the embed can legitimately be null. */}
                    <span>{job.profiles?.full_name ?? "Employeur particulier"}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <ShareButton
                        url={localisedUrl(`/offres/${job.id}`)}
                        title={job.title}
                        text={`Offre d'emploi : ${job.title}${place ? ` à ${place}` : ""}. Postulez sur Madame Dacosta Services :`}
                        variant="ghost"
                        size="sm"
                      />
                      <Link
                        href={`/offres/${job.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        Voir l&apos;offre
                      </Link>
                    </span>
                  </div>

                  {user?.profileId === job.employer_id && (
                    <Link
                      href={`/offres/${job.id}/payer`}
                      className={buttonVariants({
                        variant: "outline",
                        className: "rounded-full gap-2 mt-5",
                      })}
                    >
                      Votre offre · formule et paiement
                    </Link>
                  )}

                  {/* Le numéro de l'employeur, ou comment l'obtenir — pour un
                      candidat. Rien pour les autres : l'employeur a son lien
                      « formule et paiement » ci-dessus. */}
                  {canApply && (
                    <EmployerContact jobId={job.id} jobTitle={job.title} user={user} compact />
                  )}

                  {canApply && (
                    <ApplyButton
                      jobId={job.id}
                      jobTitle={job.title}
                      alreadyApplied={appliedTo.has(job.id)}
                    />
                  )}

                  {!user && (
                    <Link
                      href="/login"
                      className={buttonVariants({
                        variant: "outline",
                        className: "rounded-full gap-2 mt-5",
                      })}
                    >
                      <Send className="h-4 w-4" />
                      Se connecter pour postuler
                    </Link>
                  )}
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
