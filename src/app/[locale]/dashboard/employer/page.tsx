import { Briefcase, MessageSquare, Users, Plus, Search, UserPen } from "lucide-react";

type ReceivedApplication = {
  id: string;
  message: string | null;
  applied_at: string;
  status: string;
  jobs: { title: string } | null;
  profiles: { id: string; full_name: string; avatar_url: string | null } | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

function StatCard({
  icon,
  value,
  label,
  tone = "primary",
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone?: "primary" | "secondary";
}) {
  return (
    <div className="bg-card p-6 rounded-3xl border border-border shadow-soft flex items-center gap-4">
      <div
        className={`h-12 w-12 rounded-xl flex items-center justify-center ${
          tone === "primary" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default async function EmployerDashboard() {
  const user = await requireUser({ role: "employer" });
  const supabase = await createClient();

  // Every count below is scoped by RLS: an employer only ever sees their own
  // jobs, the applications addressed to them, and their own messages.
  const [jobs, applications, unread, received] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("applications").select("id", { count: "exact", head: true }),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.profileId ?? "")
      .eq("is_read", false),
    // The applications SELECT policy already limits this to postings the
    // employer owns, so no join back to `jobs` is needed to scope it.
    supabase
      .from("applications")
      .select(
        "id, message, applied_at, status, " +
          "jobs(title), profiles!applications_candidate_id_fkey(id, full_name, avatar_url)"
      )
      .order("applied_at", { ascending: false })
      .limit(20),
  ]);

  const receivedApplications = (received.data ?? []) as unknown as ReceivedApplication[];

  return (
    <div className="flex-1 bg-surface bg-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">Mon Espace Employeur</h1>
            <p className="text-muted-foreground">Bonjour {user.fullName}</p>
          </div>
          <div className="flex gap-3">
            <Link href="/candidats" className={buttonVariants({ variant: "outline", className: "rounded-full gap-2" })}>
              <Search className="h-4 w-4" />
              Chercher un profil
            </Link>
            <Link href="/offres/creer" className={buttonVariants({ className: "rounded-full gap-2" })}>
              <Plus className="h-4 w-4" />
              Publier une offre
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard icon={<Briefcase className="h-6 w-6" />} value={jobs.count ?? 0} label="Offres actives" />
          <StatCard
            icon={<Users className="h-6 w-6" />}
            value={applications.count ?? 0}
            label="Candidatures reçues"
            tone="secondary"
          />
          <StatCard
            icon={<MessageSquare className="h-6 w-6" />}
            value={unread.count ?? 0}
            label="Messages non lus"
            tone="secondary"
          />
        </div>

        <div className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-7">
          <h2 className="font-semibold mb-2">Prochaine étape</h2>
          <p className="text-sm text-muted-foreground">
            {(jobs.count ?? 0) === 0
              ? "Vous n'avez pas encore d'offre en ligne. Publiez-en une pour recevoir des candidatures, ou parcourez directement les profils vérifiés."
              : "Vos offres sont en ligne. Consultez vos messages pour répondre aux candidats intéressés."}
          </p>
          <Link
            href={(jobs.count ?? 0) === 0 ? "/offres/creer" : "/messages"}
            className={buttonVariants({ variant: "outline", className: "rounded-full mt-4" })}
          >
            {(jobs.count ?? 0) === 0 ? "Publier une offre" : "Voir mes messages"}
          </Link>
        </div>

        <section className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-7 mt-6">
          <h2 className="font-semibold mb-4">
            Candidatures reçues{" "}
            <span className="text-muted-foreground font-normal">({receivedApplications.length})</span>
          </h2>

          {receivedApplications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune candidature pour l&apos;instant. Elles apparaîtront ici dès qu&apos;un
              candidat répondra à l&apos;une de vos offres.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {receivedApplications.map((application) => (
                <li key={application.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {application.profiles?.full_name ?? "Candidat"}
                        <span className="text-muted-foreground font-normal">
                          {" · "}
                          {application.jobs?.title ?? "Offre supprimée"}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(application.applied_at)}
                      </p>
                      {application.message && (
                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">
                          {application.message}
                        </p>
                      )}
                    </div>
                    {application.profiles?.id && (
                      <Link
                        href={{
                          pathname: "/messages",
                          query: { avec: application.profiles.id },
                        }}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                          className: "rounded-full gap-2 shrink-0",
                        })}
                      >
                        <MessageSquare className="h-4 w-4" />
                        Répondre
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-7 mt-6">
          <h2 className="font-semibold mb-2">Mon profil</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Coordonnées et présentation de votre foyer. Les candidats les consultent avant de
            répondre à vos offres.
          </p>
          <Link
            href="/profil"
            className={buttonVariants({ variant: "outline", className: "rounded-full gap-2" })}
          >
            <UserPen className="h-4 w-4" />
            Modifier mon profil
          </Link>
        </div>
      </div>
    </div>
  );
}
