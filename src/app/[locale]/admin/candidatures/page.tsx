import type { Metadata } from "next";
import { Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { telLink } from "@/lib/contact/unlock";
import { EMPLOYER_STATUS_LABELS, type ApplicationStatus } from "@/lib/applications/status";
import type { AdminContact } from "@/lib/admin/contacts";

export const metadata: Metadata = {
  title: "Candidatures",
  robots: { index: false, follow: false },
};

type Row = {
  id: string;
  status: string;
  applied_at: string;
  job_id: string;
  candidate: { id: string; full_name: string } | null;
  jobs: { title: string; employer: { id: string; full_name: string } | null } | null;
};

function Contact({ name, contact }: { name: string; contact: AdminContact | undefined }) {
  return (
    <div>
      <span className="font-medium">{name}</span>
      {contact?.phone ? (
        <a
          href={telLink(contact.phone)}
          className="flex items-center gap-1 font-mono tabular-nums text-xs hover:text-primary"
        >
          <Phone className="h-3 w-3" aria-hidden />
          {contact.phone}
          {contact.phone_verified === false && (
            <span className="font-sans text-amber-700 dark:text-amber-500">(non confirmé)</span>
          )}
        </a>
      ) : (
        <span className="block text-xs text-amber-700 dark:text-amber-500">Pas de numéro</span>
      )}
    </div>
  );
}

/**
 * Toutes les candidatures du site, avec le numéro du candidat et celui de
 * l'employeur. L'administration lit toutes les candidatures (RLS is_admin) ;
 * les numéros viennent d'admin_profile_contacts().
 */
export default async function AdminApplicationsPage() {
  await requireUser({ role: "admin" });
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, status, applied_at, job_id, " +
        "candidate:profiles!applications_candidate_id_fkey(id, full_name), " +
        "jobs(title, employer:profiles!jobs_employer_id_fkey(id, full_name))"
    )
    .order("applied_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as Row[];
  const ids = [
    ...new Set(
      rows.flatMap((row) => [row.candidate?.id, row.jobs?.employer?.id]).filter(Boolean) as string[]
    ),
  ];
  const contacts = new Map<string, AdminContact>();
  if (ids.length > 0) {
    const result = await supabase.rpc("admin_profile_contacts", { p_ids: ids });
    for (const row of (result.data ?? []) as AdminContact[]) contacts.set(row.profile_id, row);
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Espace de modération
        </Link>
        <h1 className="text-3xl font-bold mt-4 mb-1">Candidatures</h1>
        <p className="text-muted-foreground mb-6">
          Les 200 plus récentes, avec le numéro du candidat et de l&apos;employeur.
        </p>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mb-6">
            Erreur de chargement : {error.message}
          </p>
        )}

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Candidat</th>
                <th className="px-4 py-3 font-medium">Offre</th>
                <th className="px-4 py-3 font-medium">Employeur</th>
                <th className="px-4 py-3 font-medium">Étape</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(row.applied_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">
                    <Contact
                      name={row.candidate?.full_name ?? "Candidat"}
                      contact={row.candidate ? contacts.get(row.candidate.id) : undefined}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/offres/${row.job_id}`} className="hover:text-primary">
                      {row.jobs?.title ?? "Offre"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Contact
                      name={row.jobs?.employer?.full_name ?? "Employeur"}
                      contact={row.jobs?.employer ? contacts.get(row.jobs.employer.id) : undefined}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {EMPLOYER_STATUS_LABELS[row.status as ApplicationStatus] ?? row.status}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Aucune candidature pour l&apos;instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
