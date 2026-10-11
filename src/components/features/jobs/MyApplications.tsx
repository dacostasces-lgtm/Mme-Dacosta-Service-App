import { Link } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { applicationStatusLabel, STATUS_TONE, type ApplicationStatus } from "@/lib/applications/status";
import { formatShortDate } from "@/lib/jobs/format";

export type MyApplicationRow = {
  id: string;
  status: string;
  applied_at: string;
  job_id: string;
  jobs: { title: string } | null;
};

/** Les candidatures du candidat, avec l'étape où l'employeur les a placées. */
export function MyApplications({ applications }: { applications: MyApplicationRow[] }) {
  if (applications.length === 0) return null;

  return (
    <section className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-7 mt-6">
      <h2 className="font-semibold mb-4">
        Mes candidatures{" "}
        <span className="text-muted-foreground font-normal">({applications.length})</span>
      </h2>
      <ul className="divide-y divide-border">
        {applications.map((application) => (
          <li
            key={application.id}
            className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="min-w-0">
              {application.jobs ? (
                <Link
                  href={`/offres/${application.job_id}`}
                  className="font-medium hover:text-primary"
                >
                  {application.jobs.title}
                </Link>
              ) : (
                // L'offre est fermée ou échue : la RLS ne la montre plus.
                <span className="font-medium text-muted-foreground">Offre fermée</span>
              )}
              <p className="text-xs text-muted-foreground">
                Envoyée le {formatShortDate(application.applied_at)}
              </p>
            </div>
            <Badge
              className={`font-medium ${STATUS_TONE[application.status as ApplicationStatus] ?? ""}`}
            >
              {applicationStatusLabel(application.status)}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
