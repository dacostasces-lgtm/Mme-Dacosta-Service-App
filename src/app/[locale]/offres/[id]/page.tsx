import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BedDouble, Briefcase, CalendarDays, Clock, MapPin, Send, Timer, Wallet } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApplyButton } from "@/components/features/jobs/ApplyButton";
import { ShareButton } from "@/components/shared/ShareButton";
import { EmployerContact } from "@/components/features/contact/EmployerContact";
import { JobOwnerPayment } from "@/components/features/jobs/JobOwnerPayment";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { formatLongDate, formatSalary } from "@/lib/jobs/format";
import { formatHours, formatWorkDays } from "@/lib/jobs/schedule";
import { jobState } from "@/lib/jobs/expiry";
import { localisedUrl } from "@/lib/site";

type Job = {
  id: string;
  title: string;
  description: string;
  salary_range_min: number | null;
  salary_range_max: number | null;
  created_at: string;
  status: string;
  employer_id: string;
  work_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  live_in: boolean;
  expires_at: string;
  profiles: { full_name: string; is_premium: boolean } | null;
  neighborhoods: { name: string; cities: { name: string; country: string } | null } | null;
};

/**
 * schema.org wants an ISO 3166-1 alpha-2 code in `addressCountry`, but `cities`
 * stores whatever the signup form captured — "Congo-Brazzaville", "Côte
 * d'Ivoire". Emitting the display name makes Google discard the location, and
 * a job posting without a usable location does not surface in Google Jobs.
 */
const COUNTRY_CODES: Record<string, string> = {
  "congo-brazzaville": "CG",
  "congo": "CG",
  "république du congo": "CG",
  "republique du congo": "CG",
  "congo-kinshasa": "CD",
  "rd congo": "CD",
  "côte d'ivoire": "CI",
  "cote d'ivoire": "CI",
  "gabon": "GA",
  "cameroun": "CM",
};

function countryCode(name: string | null | undefined) {
  if (!name) return "CG";
  const key = name.trim().toLowerCase();
  // Already a code, e.g. seeded data that stored "CG" directly.
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  return COUNTRY_CODES[key] ?? "CG";
}

const SELECT =
  "id, title, description, salary_range_min, salary_range_max, created_at, status, employer_id, " +
  "work_days, start_time, end_time, live_in, expires_at, " +
  "profiles(full_name, is_premium), neighborhoods(name, cities(name, country))";

async function getJob(id: string): Promise<Job | null> {
  if (!isSupabaseConfigured()) return null;

  // Not a uuid — a crawler following a mangled link, or a probe. Postgres would
  // raise 22P02 on the cast, which would surface as a 500 rather than a 404.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("jobs").select(SELECT).eq("id", id).maybeSingle();

  return (data as unknown as Job) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await getJob(id);

  if (!job) return { title: "Offre introuvable", robots: { index: false, follow: false } };

  const place = [job.neighborhoods?.name, job.neighborhoods?.cities?.name]
    .filter(Boolean)
    .join(", ");

  return {
    title: place ? `${job.title} — ${place}` : job.title,
    description: job.description.slice(0, 155),
    alternates: { canonical: localisedUrl(`/offres/${job.id}`) },
    openGraph: {
      type: "article",
      title: job.title,
      description: job.description.slice(0, 155),
      url: localisedUrl(`/offres/${job.id}`),
    },
    // A closed posting stays reachable for anyone holding the link, but it has
    // no business being indexed or kept in the results.
    robots:
      jobState(job.status, job.expires_at) === "closed" ||
      jobState(job.status, job.expires_at) === "expired"
        ? { index: false, follow: false }
        : undefined,
  };
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  const job = await getJob(id);

  // RLS already hides other employers' inactive postings, so a null here is a
  // genuine 404 rather than a permission problem to explain.
  if (!job) notFound();

  const place = [job.neighborhoods?.name, job.neighborhoods?.cities?.name]
    .filter(Boolean)
    .join(", ");

  const days = formatWorkDays(job.work_days);
  const hours = formatHours(job.start_time, job.end_time);

  // Visible ici seulement de son employeur et de l'admin une fois échue : la
  // politique de lecture la cache à tous les autres.
  const state = jobState(job.status, job.expires_at);
  const open = state === "available" || state === "expiring";

  const canApply = user?.role === "candidate" && open;

  let alreadyApplied = false;
  if (canApply && user.profileId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("applications")
      .select("id")
      .eq("job_id", job.id)
      .eq("candidate_id", user.profileId)
      .maybeSingle();
    alreadyApplied = Boolean(data);
  }

  // Google Jobs reads this. `hiringOrganization` is the platform rather than
  // the household: employers are private individuals here, and naming them in
  // public structured data would publish who is hiring domestic staff at home.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: new Date(job.created_at).toISOString(),
    // Google retire l'offre de ses résultats à cette date.
    validThrough: new Date(job.expires_at).toISOString(),
    employmentType: "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: "Madame Dacosta Services",
      sameAs: localisedUrl("/"),
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.neighborhoods?.cities?.name ?? "Brazzaville",
        addressRegion: job.neighborhoods?.name ?? undefined,
        addressCountry: countryCode(job.neighborhoods?.cities?.country),
      },
    },
    ...(job.salary_range_min || job.salary_range_max
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "XAF",
            value: {
              "@type": "QuantitativeValue",
              minValue: job.salary_range_min ?? undefined,
              maxValue: job.salary_range_max ?? undefined,
              unitText: "MONTH",
            },
          },
        }
      : {}),
  };

  // The CSP in proxy.ts allows scripts by nonce. A ld+json block is data rather
  // than code and browsers do not execute it, but stamping it costs nothing and
  // removes any doubt about it being refused.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="flex-1 bg-surface bg-grain py-10 sm:py-14">
      {open && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href="/offres"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Toutes les offres
        </Link>

        <article className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft mt-4">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
            <h1 className="text-3xl font-bold leading-tight">{job.title}</h1>
            <div className="flex items-center gap-2 shrink-0">
              {job.profiles?.is_premium && (
                <Badge className="bg-secondary text-secondary-foreground font-semibold">
                  Premium
                </Badge>
              )}
              {/* Rien à faire circuler pour une offre close : le lien
                  n'amènerait qu'à « plus ouverte aux candidatures ». */}
              {open && (
                <ShareButton
                  url={localisedUrl(`/offres/${job.id}`)}
                  title={job.title}
                  text={`Offre d'emploi : ${job.title}${place ? ` à ${place}` : ""}. Postulez sur Madame Dacosta Services :`}
                  size="sm"
                  className="[&_button]:h-9 [&_button]:px-4"
                />
              )}
            </div>
          </div>

          {open ? (
            <p className="inline-flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400 mb-4">
              <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
              Disponible jusqu&apos;au {formatLongDate(job.expires_at)}
            </p>
          ) : (
            <p className="text-sm font-medium bg-muted text-muted-foreground rounded-lg p-3 mb-5">
              {state === "expired"
                ? `Cette offre a expiré le ${formatLongDate(job.expires_at)}. Son employeur ne l'a pas confirmée.`
                : "Ce poste a été pourvu : l'offre n'est plus ouverte aux candidatures."}
            </p>
          )}

          <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-primary mb-6">
            <Wallet className="h-4 w-4" aria-hidden />
            {formatSalary(job.salary_range_min, job.salary_range_max)}
          </p>

          {(days || hours || job.live_in) && (
            <dl className="grid gap-3 sm:grid-cols-3 rounded-2xl bg-muted/50 p-4 mb-6 text-sm">
              <div className="flex items-start gap-2">
                <CalendarDays className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-xs text-muted-foreground">Jours de service</dt>
                  <dd className="font-medium">{days ?? "À convenir"}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Timer className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-xs text-muted-foreground">Horaires</dt>
                  <dd className="font-medium">{hours ?? "À convenir"}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <BedDouble className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-xs text-muted-foreground">Dormir sur place</dt>
                  <dd className="font-medium">{job.live_in ? "Oui, logé sur place" : "Non"}</dd>
                </div>
              </div>
            </dl>
          )}

          <div className="prose-sm whitespace-pre-line leading-relaxed text-foreground mb-6">
            {job.description}
          </div>

          <dl className="border-t border-border pt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
            {place && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                <dt className="sr-only">Lieu</dt>
                <dd>{place}</dd>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" aria-hidden />
              <dt className="sr-only">Publiée le</dt>
              <dd>{formatLongDate(job.created_at)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 shrink-0" aria-hidden />
              <dt className="sr-only">Employeur</dt>
              <dd>{job.profiles?.full_name ?? "Employeur particulier"}</dd>
            </div>
          </dl>

          {/* Son employeur y voit sa formule et peut payer ; les autres
              visiteurs, le numéro de l'employeur ou comment l'obtenir. */}
          {user?.profileId && user.profileId === job.employer_id ? (
            <JobOwnerPayment jobId={job.id} />
          ) : (
            <EmployerContact jobId={job.id} jobTitle={job.title} user={user} />
          )}

          {canApply && (
            <ApplyButton
              jobId={job.id}
              jobTitle={job.title}
              alreadyApplied={alreadyApplied}
            />
          )}

          {!user && open && (
            <Link
              href="/login"
              className={buttonVariants({ variant: "outline", className: "rounded-full gap-2 mt-6" })}
            >
              <Send className="h-4 w-4" />
              Se connecter pour postuler
            </Link>
          )}
        </article>
      </div>
    </div>
  );
}
