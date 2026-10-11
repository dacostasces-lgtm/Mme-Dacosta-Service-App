import { BellRing } from "lucide-react";
import { Link } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { JobStatusButtons } from "@/components/features/jobs/JobStatusButtons";
import { ShareButton } from "@/components/shared/ShareButton";
import { localisedUrl } from "@/lib/site";
import { firstPayment, type JobPaymentRow } from "@/lib/jobs/payment";
import { formatShortDate } from "@/lib/jobs/format";
import { daysLeft, JOB_LIFETIME_DAYS, jobState, type JobState } from "@/lib/jobs/expiry";

export type MyJobRow = {
  id: string;
  title: string;
  status: string;
  expires_at: string;
  created_at: string;
  /** Embarqué par `applications(count)` ; absent sur la page de modération. */
  applications?: { count: number }[];
  /** Embarqué sur le tableau de bord employeur ; absent sur la page de modération. */
  job_payments?: JobPaymentRow | JobPaymentRow[] | null;
};

const BADGE: Record<JobState, { label: string; className: string }> = {
  available: { label: "Disponible", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  expiring: { label: "À confirmer", className: "bg-secondary/25 text-foreground" },
  expired: { label: "Expirée", className: "bg-destructive/10 text-destructive" },
  closed: { label: "Pourvue", className: "bg-muted text-muted-foreground" },
};

function stateLine(job: MyJobRow, state: JobState) {
  if (state === "closed") return "Retirée des offres.";
  if (state === "expired") {
    return `Expirée le ${formatShortDate(job.expires_at)} : les candidats ne la voient plus.`;
  }
  const left = daysLeft(job.expires_at);
  return `En ligne jusqu'au ${formatShortDate(job.expires_at)} (${left} jour${left > 1 ? "s" : ""}).`;
}

/**
 * La question posée pour chaque offre qui arrive à échéance ou vient
 * d'expirer. C'est la notification : elle s'affiche en tête du tableau de bord
 * à chaque visite tant que l'employeur n'a pas répondu.
 */
export function JobReminders({ jobs }: { jobs: MyJobRow[] }) {
  const toConfirm = jobs
    .map((job) => ({ job, state: jobState(job.status, job.expires_at) }))
    .filter(({ state }) => state === "expiring" || state === "expired");

  if (toConfirm.length === 0) return null;

  return (
    <section
      aria-labelledby="offres-a-confirmer"
      className="rounded-3xl border-2 border-secondary bg-secondary/10 p-6 sm:p-7 mb-8"
    >
      <h2 id="offres-a-confirmer" className="font-semibold flex items-center gap-2 mb-1">
        <BellRing className="h-5 w-5 text-secondary" aria-hidden />
        {toConfirm.length > 1
          ? `${toConfirm.length} offres sont-elles toujours disponibles ?`
          : "Votre offre est-elle toujours disponible ?"}
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Sans confirmation, une offre disparaît {JOB_LIFETIME_DAYS} jours après sa publication ou
        sa dernière confirmation, pour que les candidats ne postulent pas à des postes déjà
        pourvus.
      </p>
      <ul className="space-y-4">
        {toConfirm.map(({ job, state }) => (
          <li key={job.id} className="bg-card rounded-2xl border border-border p-4">
            <p className="font-medium">
              <Link href={`/offres/${job.id}`} className="hover:text-primary">
                {job.title}
              </Link>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">{stateLine(job, state)}</p>
            <JobStatusButtons jobId={job.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Gratuite, payante, ou paiement en cours — et le lien pour changer. */
function Formula({ job, premium }: { job: MyJobRow; premium: boolean }) {
  const payment = firstPayment(job.job_payments);
  if (premium && payment?.status !== "active") {
    return (
      <p className="text-xs font-medium text-green-700 dark:text-green-400 mt-1">
        Incluse dans votre Premium : numéros des candidats visibles
      </p>
    );
  }
  if (payment?.status === "active") {
    return (
      <p className="text-xs font-medium text-green-700 dark:text-green-400 mt-1">
        Offre payante : numéros des candidats visibles
      </p>
    );
  }
  if (payment?.status === "pending_payment") {
    return (
      <Link
        href={`/offres/${job.id}/payer`}
        className="text-xs font-medium text-primary hover:underline mt-1 inline-block"
      >
        {payment.payment_declared_at ? "Paiement en cours de vérification" : "Paiement à régler"} →
      </Link>
    );
  }
  return (
    <p className="text-xs text-muted-foreground mt-1">
      Offre gratuite ·{" "}
      <Link href={`/offres/${job.id}/payer`} className="font-medium text-primary hover:underline">
        voir les numéros des candidats
      </Link>
    </p>
  );
}

function applicationCount(job: MyJobRow) {
  const count = job.applications?.[0]?.count ?? 0;
  if (count === 0) return "Aucune candidature pour l'instant";
  return `${count} candidature${count > 1 ? "s" : ""} — voir`;
}

/** Toutes les offres de l'employeur, avec leur état. */
export function MyJobs({ jobs, premium = false }: { jobs: MyJobRow[]; premium?: boolean }) {
  return (
    <section className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-7 mt-6">
      <h2 className="font-semibold mb-4">
        Mes offres <span className="text-muted-foreground font-normal">({jobs.length})</span>
      </h2>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Vous n&apos;avez encore publié aucune offre.</p>
      ) : (
        <ul className="divide-y divide-border">
          {jobs.map((job) => {
            const state = jobState(job.status, job.expires_at);
            return (
              <li
                key={job.id}
                className="py-4 first:pt-0 last:pb-0 flex flex-wrap items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium flex flex-wrap items-center gap-2">
                    <Link href={`/offres/${job.id}`} className="hover:text-primary">
                      {job.title}
                    </Link>
                    <Badge className={`font-medium ${BADGE[state].className}`}>
                      {BADGE[state].label}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stateLine(job, state)}</p>
                  {job.job_payments !== undefined && <Formula job={job} premium={premium} />}
                  {job.applications && (
                    <a
                      href="#candidatures"
                      className="text-xs font-medium text-primary hover:underline mt-1 inline-block"
                    >
                      {applicationCount(job)}
                    </a>
                  )}
                </div>
                {/* Une offre pourvue se remet en ligne d'un clic si le poste se
                    libère à nouveau ; elle n'a plus rien à fermer. */}
                <div className="flex flex-wrap items-start gap-2">
                  {(state === "available" || state === "expiring") && (
                    <ShareButton
                      url={localisedUrl(`/offres/${job.id}`)}
                      title={job.title}
                      text={`Je recrute : ${job.title}. Postulez sur Madame Dacosta Services :`}
                      size="sm"
                      align="left"
                      className="[&_button]:h-8 [&_button]:px-3"
                    />
                  )}
                  <JobStatusButtons jobId={job.id} canClose={state !== "closed"} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
