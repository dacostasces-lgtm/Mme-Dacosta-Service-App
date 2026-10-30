import { Ban, Briefcase, MessageSquare, Users, Plus, Search, UserPen } from "lucide-react";

type ReceivedApplication = {
  id: string;
  message: string | null;
  applied_at: string;
  status: string;
  job_id: string;
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
import { ApplicationStatusSelect } from "@/components/features/jobs/ApplicationStatusSelect";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  BookingList,
  type BookingRow,
  type MyReviews,
} from "@/components/features/booking/BookingList";
import {
  ApplicantContact,
  type ApplicantContactRow,
} from "@/components/features/jobs/ApplicantContact";
import { JobReminders, MyJobs, type MyJobRow } from "@/components/features/jobs/MyJobs";
import { jobState } from "@/lib/jobs/expiry";
import { COMPANY } from "@/lib/legal/company";

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

  // Scoped by RLS — except jobs: the jobs policy also shows every *public*
  // offer, so they are filtered on the employer explicitly. Without it the
  // « Offres actives » counter counted the whole site's offers.
  const [jobs, applications, unread, received, bookings, contacts, avisLaisses] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, title, status, expires_at, created_at, applications(count), " +
          "job_payments(id, status, payment_declared_at)"
      )
      .eq("employer_id", user.profileId ?? "")
      .order("created_at", { ascending: false })
      .limit(50),
    // Filtré sur les offres de l'employeur et pas laissé à la RLS : pour un
    // compte admin, qui passe la politique de lecture, ce seraient sinon les
    // candidatures de tout le site.
    supabase
      .from("applications")
      .select("id, jobs!inner(employer_id)", { count: "exact", head: true })
      .eq("jobs.employer_id", user.profileId ?? ""),
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
        "id, job_id, message, applied_at, status, " +
          "jobs!inner(title, employer_id), profiles!applications_candidate_id_fkey(id, full_name, avatar_url)"
      )
      .eq("jobs.employer_id", user.profileId ?? "")
      .order("applied_at", { ascending: false })
      .limit(20),
    // Visibles des deux côtés par la policy « Bookings are visible to both
    // parties » : une simple lecture suffit, chacun ne voit que les siennes.
    supabase
      .from("bookings")
      .select(
        "id, status, amount, currency, contract_type, start_date, address, payment_declared_at, created_at, " +
          "contrepartie:profiles!bookings_candidate_id_fkey(id, full_name)"
      )
      .eq("employer_id", user.profileId ?? "")
      .order("created_at", { ascending: false })
      .limit(20),
    // Le numéro de chaque candidat, pour les offres payantes seulement.
    supabase.rpc("my_applicant_contacts"),
    // Les avis que cet employeur a déjà laissés, pour que le formulaire se
    // rouvre sur ce qu'il a écrit plutôt que vide. Filtré sur `reviewer_id` :
    // ce ne sont pas les avis reçus.
    supabase
      .from("reviews")
      .select("reviewee_id, rating, comment")
      .eq("reviewer_id", user.profileId ?? ""),
  ]);

  const mesAvis: MyReviews = Object.fromEntries(
    ((avisLaisses.data ?? []) as { reviewee_id: string; rating: number; comment: string | null }[])
      .map((avis) => [avis.reviewee_id, { rating: avis.rating, comment: avis.comment }])
  );

  const receivedApplications = (received.data ?? []) as unknown as ReceivedApplication[];
  const myJobs = (jobs.data ?? []) as unknown as MyJobRow[];
  const contactByApplication = new Map(
    ((contacts.data ?? []) as ApplicantContactRow[]).map((row) => [row.application_id, row])
  );
  const liveJobs = myJobs.filter((job) => {
    const state = jobState(job.status, job.expires_at);
    return state === "available" || state === "expiring";
  }).length;

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

        {/* Écarté par la modération : le dire, avec le motif s'il y en a un.
            Le refus s'ouvre maintenant aux comptes employeurs comme aux
            candidats ; sans ce bloc, une personne écartée n'en saurait rien et
            continuerait de se demander pourquoi ses offres ne partent pas. */}
        {user.rejection && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 mb-6 flex items-start gap-4">
            <Ban className="h-6 w-6 text-destructive shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Votre compte n&apos;a pas été retenu par notre équipe</p>
              {user.rejection.reason && (
                <p className="text-sm mt-1">
                  Motif : <span className="font-medium">{user.rejection.reason}</span>
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Corrigez ce qui est indiqué dans{" "}
                <Link href="/profil" className="font-medium text-primary hover:underline">
                  votre profil
                </Link>
                , puis écrivez-nous :{" "}
                <a
                  href={`https://wa.me/${COMPANY.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  WhatsApp {COMPANY.phone}
                </a>
                .
              </p>
            </div>
          </div>
        )}

        {/* Le numéro est obligatoire pour publier une offre. */}
        {user.missingProfileFields.length > 0 && (
          <div className="rounded-3xl border-2 border-secondary bg-secondary/10 p-6 sm:p-7 mb-8">
            <h2 className="font-semibold mb-1">Ajoutez votre numéro de téléphone</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Il est obligatoire pour publier une offre : c&apos;est par lui que les candidats et
              notre équipe vous joignent.
            </p>
            <Link
              href="/profil"
              className={buttonVariants({ className: "rounded-full gap-2" })}
            >
              <UserPen className="h-4 w-4" />
              Ajouter mon numéro
            </Link>
          </div>
        )}

        <JobReminders jobs={myJobs} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard icon={<Briefcase className="h-6 w-6" />} value={liveJobs} label="Offres en ligne" />
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
            {liveJobs === 0
              ? "Vous n'avez pas encore d'offre en ligne. Publiez-en une pour recevoir des candidatures, ou parcourez directement les profils vérifiés."
              : "Vos offres sont en ligne. Consultez vos messages pour répondre aux candidats intéressés."}
          </p>
          <Link
            href={liveJobs === 0 ? "/offres/creer" : "/messages"}
            className={buttonVariants({ variant: "outline", className: "rounded-full mt-4" })}
          >
            {liveJobs === 0 ? "Publier une offre" : "Voir mes messages"}
          </Link>
        </div>

        {/* is_premium suffit à l'affichage ; l'accès aux numéros, lui, est
            décidé en base sur l'échéance de l'abonnement. */}
        <MyJobs jobs={myJobs} premium={user.isPremium} />

        <section
          id="candidatures"
          className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-7 mt-6 scroll-mt-24"
        >
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
                      {/* Masqué tant que la migration manque : sans elle, on
                          ne sait pas si l'offre est payante. */}
                      {!contacts.error && (
                        <ApplicantContact
                          contact={contactByApplication.get(application.id)}
                          jobId={application.job_id}
                          jobTitle={application.jobs?.title ?? "votre offre"}
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <ApplicationStatusSelect
                      applicationId={application.id}
                      status={application.status}
                    />
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

        <section className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-7 mt-6">
          <h2 className="font-semibold mb-1">Mes réservations</h2>
          <p className="text-sm text-muted-foreground mb-5">Les candidats que vous avez réservés, et où en est le règlement.</p>
          <BookingList
            bookings={(bookings.data ?? []) as unknown as BookingRow[]}
            role="employer"
            reviews={mesAvis}
          />
        </section>

      </div>
    </div>
  );
}
