import { ShieldCheck, Clock, MapPin, Mail, Undo2, Check, X, UserPlus, Phone, Database, Users, Home } from "lucide-react";
import { missingCandidateFields } from "@/lib/profile/completeness";
import { telLink, whatsappLink } from "@/lib/contact/unlock";
import { loadCandidateAddresses, type AdminContact } from "@/lib/admin/contacts";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/dal";
import { JobReminders, type MyJobRow } from "@/components/features/jobs/MyJobs";
import {
  JobPaymentQueue,
  type DeclaredJobPayment,
} from "@/components/features/admin/JobPaymentQueue";
import {
  ContactUnlockQueue,
  type DeclaredUnlock,
} from "@/components/features/admin/ContactUnlockQueue";
import {
  CandidateUnlockQueue,
  type DeclaredCandidateUnlock,
} from "@/components/features/admin/CandidateUnlockQueue";
import { createClient } from "@/lib/supabase/server";
import { setProfileValidation, setCandidateCheck, type CandidateCheck } from "@/lib/admin/actions";
import { PaymentQueue, type DeclaredPayment } from "@/components/features/admin/PaymentQueue";
import { AdminOverview } from "@/components/features/admin/AdminOverview";
import { SmsCredit } from "@/components/features/admin/SmsCredit";
import { accountBalance, isOtpConfigured } from "@/lib/otp/infobip";
import {
  SubscriptionQueue,
  type DeclaredSubscription,
} from "@/components/features/admin/SubscriptionQueue";

type CandidateDetails = {
  job_title: string | null;
  experience: string | null;
  age: number | null;
  gender: string | null;
  availability: string | null;
  desired_salary: number | null;
  skills: unknown;
  languages: unknown;
  work_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  identity_checked_at: string | null;
  criminal_record_checked_at: string | null;
  interview_passed_at: string | null;
};

type ModerationProfile = {
  id: string;
  full_name: string;
  email: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  phone_verified?: boolean;
  /** Adresse précise d'un candidat ; `undefined` si la table n'est pas lisible. */
  address?: string | null;
  role: string;
  created_at: string;
  phone_present: boolean | null;
  neighborhood_id: string | null;
  neighborhoods: { name: string; cities: { name: string; country: string } | null } | null;
  candidate_details: CandidateDetails | null;
};

// `email` is deliberately absent: 20260728010000_restrict_profile_pii.sql
// revoked it from the `authenticated` role, so selecting it here would fail the
// whole query. Addresses come from admin_profile_emails() below instead.
// La clé étrangère est nommée explicitement, sans quoi PostgREST refuse la
// requête entière : depuis 20260727210000, `candidate_details` référence
// `profiles` quatre fois — une par colonne `*_checked_by` en plus de
// `profile_id` — et l'embed devient ambigu. Toute la file de modération
// tombait sur « Could not embed because more than one relationship was found ».
const SELECT =
  "id, full_name, role, created_at, phone_present, neighborhood_id, " +
  "neighborhoods(name, cities(name, country)), " +
  // `age` et `gender` sont absents : 20261017110000 les a retirés de la
  // lecture par colonne — ils étaient publics dès qu'un profil l'était, et ce
  // sont les critères mêmes sur lesquels on discrimine. Ils reviennent par
  // admin_candidate_private() ci-dessous, qui refuse à qui n'est pas admin.
  "candidate_details!candidate_details_profile_id_fkey(job_title, experience, " +
  "availability, desired_salary, skills, languages, work_days, start_time, end_time, " +
  "identity_checked_at, criminal_record_checked_at, interview_passed_at)";

const CHECKS: { key: CandidateCheck; label: string; field: keyof CandidateDetails }[] = [
  { key: "identity", label: "Identité", field: "identity_checked_at" },
  { key: "criminal_record", label: "Casier", field: "criminal_record_checked_at" },
  { key: "interview", label: "Entretien", field: "interview_passed_at" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function VerificationToggles({ profile }: { profile: ModerationProfile }) {
  const details = profile.candidate_details;

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
      <span className="text-xs text-muted-foreground self-center mr-1">Vérifications :</span>
      {CHECKS.map(({ key, label, field }) => {
        const done = Boolean(details?.[field]);
        return (
          <form key={key} action={setCandidateCheck.bind(null, profile.id, key, !done)}>
            <Button
              type="submit"
              variant={done ? "secondary" : "outline"}
              size="sm"
              className="rounded-full gap-1"
              title={done ? `Retirer : ${label}` : `Confirmer : ${label}`}
            >
              {done ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-40" />}
              {label}
            </Button>
          </form>
        );
      })}
    </div>
  );
}

/** Les cases vides d'un profil candidat, pour décider avant de publier. */
function MissingFields({ profile }: { profile: ModerationProfile }) {
  const d = profile.candidate_details;
  const missing = missingCandidateFields({
    phonePresent: Boolean(profile.phone_present),
    neighborhoodId: profile.neighborhood_id,
    // `undefined` : adresses illisibles (migration pas encore passée), donc
    // pas réclamées.
    address: profile.address === undefined ? "?" : profile.address,
    jobTitle: d?.job_title,
    experience: d?.experience,
    age: d?.age,
    gender: d?.gender,
    availability: d?.availability,
    desiredSalary: d?.desired_salary,
    skills: d?.skills,
    languages: d?.languages,
    workDays: d?.work_days,
    startTime: d?.start_time,
    endTime: d?.end_time,
  });
  if (missing.length === 0) {
    return <p className="text-xs text-green-700 dark:text-green-400">Profil complet</p>;
  }
  return (
    <p className="text-xs text-amber-700 dark:text-amber-500">
      Profil incomplet — manque : {missing.join(", ")}
    </p>
  );
}

function ProfileRow({ profile, validated }: { profile: ModerationProfile; validated: boolean }) {
  const city = profile.neighborhoods?.cities;
  const place = [profile.neighborhoods?.name, city?.name].filter(Boolean).join(", ");
  const isCandidate = profile.role === "candidate";

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-12 w-12 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold uppercase">
          {profile.full_name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{profile.full_name}</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-muted-foreground">
              {profile.role === "employer" ? "Employeur" : profile.role === "admin" ? "Admin" : "Candidat"}
            </span>
          </div>

          {isCandidate && <MissingFields profile={profile} />}

          {profile.candidate_details?.job_title && (
            <p className="text-sm text-muted-foreground truncate">
              {profile.candidate_details.job_title}
              {profile.candidate_details.experience && ` · ${profile.candidate_details.experience}`}
            </p>
          )}

          <div className="flex items-center gap-4 flex-wrap mt-1 text-xs text-muted-foreground">
            {profile.phone && (
              <a
                href={telLink(profile.phone)}
                className="flex items-center gap-1 font-mono tabular-nums text-foreground hover:text-primary"
              >
                <Phone className="h-3 w-3 shrink-0" />
                {profile.phone}
                {profile.phone_verified === false && (
                  <span className="font-sans text-amber-700 dark:text-amber-500">(non confirmé)</span>
                )}
              </a>
            )}
            {profile.whatsapp && profile.whatsapp !== profile.phone && (
              <a
                href={whatsappLink(profile.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono tabular-nums hover:text-primary"
              >
                WhatsApp {profile.whatsapp}
              </a>
            )}
            {profile.phone === null && (
              <span className="text-amber-700 dark:text-amber-500">Pas de numéro</span>
            )}
            {profile.email && (
              <span className="flex items-center gap-1 min-w-0">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{profile.email}</span>
              </span>
            )}
            {place && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {place}
              </span>
            )}
            {profile.address && (
              <span className="flex items-center gap-1 min-w-0">
                <Home className="h-3 w-3 shrink-0" />
                <span className="truncate">{profile.address}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              Inscrit le {formatDate(profile.created_at)}
            </span>
          </div>
        </div>

        <form action={setProfileValidation.bind(null, profile.id, !validated)} className="shrink-0">
          <Button type="submit" variant={validated ? "outline" : "default"} className="h-10 rounded-full px-4 gap-2">
            {validated ? (
              <>
                <Undo2 className="h-4 w-4" />
                Retirer
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Publier
              </>
            )}
          </Button>
        </form>
      </div>

      {isCandidate && <VerificationToggles profile={profile} />}
    </div>
  );
}

export default async function AdminPage() {
  const admin = await requireUser({ role: "admin" });

  const supabase = await createClient();
  // Hors du Promise.all ci-dessous : le solde part chez Infobip, pas chez
  // Supabase, et une lenteur de leur côté ne doit pas retarder la file de
  // modération. `accountBalance` ne rejette jamais.
  const soldePromise = accountBalance();

  // Retire le Premium des abonnements échus avant d'afficher quoi que ce soit.
  // C'est le rôle de la tâche pg_cron « expire-subscriptions », mais elle
  // n'existe que si l'extension était disponible quand la migration a tourné ;
  // sans elle, un Premium échu gardait son badge et sa place en tête de la
  // recherche. Ici, à chaque visite de la modération, au pire une fois par
  // jour en pratique. La fonction n'est ouverte qu'au rôle de service.
  await createAdminClient()?.rpc("expire_subscriptions");

  const [
    pending,
    validated,
    declared,
    subscriptions,
    ownJobs,
    unlocks,
    jobPayments,
    candidateUnlocks,
  ] = await Promise.all([
    supabase.from("profiles").select(SELECT).eq("is_validated", false).order("created_at"),
    supabase
      .from("profiles")
      .select(SELECT)
      .eq("is_validated", true)
      .order("created_at", { ascending: false })
      .limit(20),
    // "Awaiting confirmation" is an unpaid booking whose employer has declared a
    // transaction — there is no dedicated status for it, see the migration.
    supabase
      .from("bookings")
      .select(
        "id, amount, currency, payment_method, payment_reference, payment_declared_at, " +
          "employer:profiles!bookings_employer_id_fkey(full_name), " +
          "candidate:profiles!bookings_candidate_id_fkey(full_name)"
      )
      .eq("status", "pending_payment")
      .not("payment_declared_at", "is", null)
      .order("payment_declared_at"),
    // Premium requests whose buyer has sent a transaction id.
    supabase
      .from("subscriptions")
      .select(
        // Même ambiguïté : `payment_confirmed_by`, ajouté par
        // 20260728050000, est un second lien vers `profiles`.
        "id, plan_name, price, payment_reference, payment_declared_at, " +
          "profiles!subscriptions_profile_id_fkey(full_name, role)"
      )
      .eq("status", "pending_payment")
      .not("payment_declared_at", "is", null)
      .order("payment_declared_at"),
    // L'administration publie aussi des offres : le même rappel d'échéance
    // qu'un employeur, puisque ce tableau de bord tient lieu du sien.
    supabase
      .from("jobs")
      .select("id, title, status, expires_at, created_at")
      .eq("employer_id", admin.profileId ?? "")
      .order("created_at", { ascending: false })
      .limit(50),
    // Numéros d'employeur dont le paiement a été déclaré.
    supabase
      .from("contact_unlocks")
      .select(
        "id, price, payment_reference, payment_declared_at, " +
          "candidate:profiles!contact_unlocks_candidate_id_fkey(full_name), jobs(title)"
      )
      .eq("status", "pending_payment")
      .not("payment_declared_at", "is", null)
      .order("payment_declared_at"),
    // Offres payantes dont l'employeur a déclaré le paiement.
    supabase
      .from("job_payments")
      .select(
        "id, price, payment_reference, payment_declared_at, " +
          "employer:profiles!job_payments_employer_id_fkey(full_name), jobs(title)"
      )
      .eq("status", "pending_payment")
      .not("payment_declared_at", "is", null)
      .order("payment_declared_at"),
    // Numéros de candidat qu'un employeur dit avoir payés, depuis une fiche.
    supabase
      .from("candidate_unlocks")
      .select(
        "id, price, payment_reference, payment_declared_at, " +
          "employer:profiles!candidate_unlocks_employer_id_fkey(full_name), " +
          "candidate:profiles!candidate_unlocks_candidate_id_fkey(full_name)"
      )
      .eq("status", "pending_payment")
      .not("payment_declared_at", "is", null)
      .order("payment_declared_at"),
  ]);

  // Le symptôme, pas la cause : un crédit épuisé se traduit par des numéros
  // qui restent non confirmés. Compté à part parce que la colonne calculée
  // n'expose que la présence du numéro, jamais sa valeur.
  const { count: numerosNonVerifies } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("phone_present", true)
    .is("phone_verified_at", null);

  const solde = await soldePromise;

  const error = pending.error ?? validated.error;
  const pendingProfiles = (pending.data ?? []) as unknown as ModerationProfile[];
  const validatedProfiles = (validated.data ?? []) as unknown as ModerationProfile[];

  // One guarded call for both lists rather than an embed per row. The function
  // raises for non-admins, so a failure here means the email column simply goes
  // unshown — the queue itself must keep working.
  //
  // admin_profile_contacts() (20261011080000) donne aussi le téléphone et
  // WhatsApp ; tant qu'elle n'est pas en base, on retombe sur l'email seul.
  const contacts = new Map<string, Partial<ModerationProfile>>();
  const ids = [...pendingProfiles, ...validatedProfiles].map((profile) => profile.id);
  if (ids.length > 0) {
    const full = await supabase.rpc("admin_profile_contacts", { p_ids: ids });
    if (!full.error) {
      for (const row of (full.data ?? []) as AdminContact[]) {
        contacts.set(row.profile_id, {
          email: row.email,
          phone: row.phone,
          whatsapp: row.whatsapp,
          phone_verified: row.phone_verified,
        });
      }
    } else {
      const { data } = await supabase.rpc("admin_profile_emails", { p_ids: ids });
      for (const row of (data ?? []) as { profile_id: string; email: string | null }[]) {
        contacts.set(row.profile_id, { email: row.email });
      }
    }
  }
  // Âge et sexe, réservés à la modération, qui en a besoin pour juger un
  // dossier complet — sans qu'ils soient lisibles par le premier venu.
  const prives = new Map<string, { age: number | null; gender: string | null }>();
  if (ids.length > 0) {
    const { data, error: erreurPrives } = await supabase.rpc("admin_candidate_private", {
      p_ids: ids,
    });
    // Une erreur ici (migration pas encore passée) laisse simplement ces deux
    // champs vides : la file de modération doit continuer de s'afficher.
    if (!erreurPrives) {
      for (const row of (data ?? []) as {
        profile_id: string;
        age: number | null;
        gender: string | null;
      }[]) {
        prives.set(row.profile_id, { age: row.age, gender: row.gender });
      }
    }
  }

  // Adresses précises des candidats, lisibles par l'administration seule.
  const addresses = await loadCandidateAddresses(supabase, ids);
  const withEmail = (profile: ModerationProfile): ModerationProfile => ({
    ...profile,
    email: null,
    ...contacts.get(profile.id),
    ...(addresses ? { address: addresses.get(profile.id) ?? null } : {}),
    candidate_details: profile.candidate_details
      ? { ...profile.candidate_details, ...prives.get(profile.id) }
      : profile.candidate_details,
  });
  const declaredPayments = (declared.data ?? []) as unknown as DeclaredPayment[];
  // Kept apart from `error`: until 20260728000000_manual_mobile_money.sql is
  // applied the payment columns don't exist, and folding this in would hide the
  // whole moderation queue behind an error banner about an unrelated feature.
  const paymentsUnavailable = declared.error?.message ?? null;
  // Same reasoning: until 20260728050000_subscriptions_manual.sql is applied the
  // status column does not exist, and that must not hide the moderation queue.
  const declaredSubscriptions = subscriptions.error
    ? []
    : ((subscriptions.data ?? []) as unknown as DeclaredSubscription[]);

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold">Espace de modération</h1>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/utilisateurs"
              className={buttonVariants({ variant: "outline", className: "h-11 rounded-full px-5 gap-2" })}
            >
              <Database className="h-4 w-4" />
              Base de données
            </Link>
            <Link
              href="/admin/candidatures"
              className={buttonVariants({ variant: "outline", className: "h-11 rounded-full px-5 gap-2" })}
            >
              <Users className="h-4 w-4" />
              Candidatures
            </Link>
            <Link
              href="/admin/candidats/nouveau"
              className={buttonVariants({ className: "h-11 rounded-full px-5 gap-2" })}
            >
              <UserPlus className="h-4 w-4" />
              Ajouter un candidat
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground mb-8">
          Vous validez ici les paiements et les profils. Un profil n&apos;apparaît dans la
          recherche qu&apos;une fois publié, et les vérifications que vous cochez s&apos;affichent
          sur la fiche publique : ne confirmez que ce que vous avez réellement constaté.
        </p>

        <JobReminders jobs={(ownJobs.data ?? []) as MyJobRow[]} />

        {/* L'administration publie aussi des offres : leurs candidatures se
            lisent sur le tableau de bord employeur, qu'elle peut ouvrir. */}
        {(ownJobs.data ?? []).length > 0 && (
          <Link
            href="/dashboard/employer#candidatures"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Mes offres et les candidatures reçues →
          </Link>
        )}

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mb-8">
            Erreur de chargement : {error.message}
          </p>
        )}

        <AdminOverview
          // null, not 0: an unapplied migration must not read as "nothing to do".
          payments={paymentsUnavailable ? null : declaredPayments.length}
          subscriptions={subscriptions.error ? null : declaredSubscriptions.length}
          // Les deux sens sous la même rubrique « Numéros » ; une seule des
          // deux migrations appliquée suffit à afficher un compte.
          unlocks={
            unlocks.error && candidateUnlocks.error
              ? null
              : (unlocks.data ?? []).length + (candidateUnlocks.data ?? []).length
          }
          jobPayments={jobPayments.error ? null : (jobPayments.data ?? []).length}
          profiles={pendingProfiles.length}
        />

        <div className="mb-12">
          <SmsCredit
            solde={solde.ok ? { balance: solde.balance, currency: solde.currency } : null}
            // Pas d'erreur affichée quand la fonctionnalité n'est simplement
            // pas configurée : ce n'est pas une panne, et le composant le dit
            // autrement.
            erreur={!solde.ok && isOtpConfigured() ? solde.error : null}
            numerosNonVerifies={numerosNonVerifies ?? 0}
          />
        </div>

        {/* scroll-mt clears the fixed navbar when the overview jumps here. */}
        <div id="paiements" className="scroll-mt-24">
          <PaymentQueue payments={declaredPayments} unavailable={paymentsUnavailable} />
        </div>

        <div id="abonnements" className="scroll-mt-24">
          <SubscriptionQueue subscriptions={declaredSubscriptions} />
        </div>

        {/* Masquée tant que sa migration n'est pas passée, comme l'est le
            compteur ci-dessus : une file vide mentirait. */}
        {!jobPayments.error && (
          <div id="offres-payantes" className="scroll-mt-24">
            <JobPaymentQueue
              payments={(jobPayments.data ?? []) as unknown as DeclaredJobPayment[]}
            />
          </div>
        )}

        <div id="numeros" className="scroll-mt-24">
          {!unlocks.error && (
            <ContactUnlockQueue
              unlocks={(unlocks.data ?? []) as unknown as DeclaredUnlock[]}
            />
          )}
          {!candidateUnlocks.error && (
            <CandidateUnlockQueue
              unlocks={(candidateUnlocks.data ?? []) as unknown as DeclaredCandidateUnlock[]}
            />
          )}
        </div>

        <section id="profils" className="mb-12 scroll-mt-24">
          <h2 className="text-lg font-semibold mb-4">
            En attente{" "}
            <span className="text-muted-foreground font-normal">({pendingProfiles.length})</span>
          </h2>

          {pendingProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-6 text-center">
              Aucun profil en attente.
            </p>
          ) : (
            <div className="space-y-3">
              {pendingProfiles.map((profile) => (
                <ProfileRow key={profile.id} profile={withEmail(profile)} validated={false} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">
            Profils publiés{" "}
            <span className="text-muted-foreground font-normal">({validatedProfiles.length})</span>
          </h2>

          {validatedProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-6 text-center">
              Aucun profil publié pour l&apos;instant.
            </p>
          ) : (
            <div className="space-y-3">
              {validatedProfiles.map((profile) => (
                <ProfileRow key={profile.id} profile={withEmail(profile)} validated />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
