import type { Metadata } from "next";
import { Link } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/subscriptions/plans";
import { RecheckDepositButton } from "@/components/features/admin/RecheckDeposit";

export const metadata: Metadata = {
  title: "Paiements reçus",
  robots: { index: false, follow: false },
};

type Deposit = {
  deposit_id: string;
  purpose: "contact_unlock" | "candidate_unlock" | "job_payment" | "subscription";
  target_id: string;
  amount: number;
  currency: string;
  phone: string | null;
  provider: string | null;
  status: string;
  failure_code: string | null;
  provider_transaction_id: string | null;
  created_at: string;
  profile: { full_name: string; role: string } | null;
};

const ACHATS: Record<Deposit["purpose"], string> = {
  contact_unlock: "Numéro d'un employeur",
  candidate_unlock: "Numéro d'un candidat",
  job_payment: "Publication d'une offre",
  subscription: "Abonnement",
};

const ROLES: Record<string, string> = {
  candidate: "candidat",
  employer: "employeur",
  admin: "administration",
};

/** Les raisons d'échec que PawaPay renvoie le plus souvent, en clair. */
const ECHECS: Record<string, string> = {
  INSUFFICIENT_BALANCE: "solde insuffisant",
  PAYMENT_NOT_APPROVED: "paiement non validé sur le téléphone",
  PAYER_NOT_FOUND: "numéro inconnu de l'opérateur",
  PAYER_LIMIT_REACHED: "plafond du compte Mobile Money atteint",
  NOT_FOUND: "introuvable chez PawaPay",
  UNSPECIFIED_FAILURE: "refusé par l'opérateur",
};

const EN_COURS = new Set(["ACCEPTED", "PROCESSING", "IN_RECONCILIATION"]);

/** MTN_MOMO_COG → MTN, AIRTEL_COG → Airtel. */
function operateur(provider: string | null) {
  if (!provider) return "Opérateur inconnu";
  if (/MTN/i.test(provider)) return "MTN";
  if (/AIRTEL/i.test(provider)) return "Airtel";
  return provider;
}

const DATE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Brazzaville",
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Les paiements passés par PawaPay, avec qui a payé, quoi, et par quel
 * opérateur.
 *
 * Ils se règlent seuls : ils n'apparaissent donc jamais dans les files de la
 * modération, qui ne montrent que les virements déclarés à la main. C'est ce qui
 * manquait pour rapprocher le solde PawaPay de ce que le site a vendu (demandé
 * le 22 novembre 2026). Les montants sont ceux payés par les clients : PawaPay
 * retire sa commission avant de créditer le compte.
 */
export default async function AdminPaymentsPage() {
  await requireUser({ role: "admin" });
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pawapay_deposits")
    .select(
      "deposit_id, purpose, target_id, amount, currency, phone, provider, status, failure_code, " +
        "provider_transaction_id, created_at, profile:profiles!pawapay_deposits_profile_id_fkey(full_name, role)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const deposits = (data ?? []) as unknown as Deposit[];
  const details = await describeTargets(supabase, deposits);

  const recus = deposits.filter((deposit) => deposit.status === "COMPLETED");
  const parOperateur = new Map<string, { total: number; nombre: number }>();
  for (const deposit of recus) {
    const nom = operateur(deposit.provider);
    const ligne = parOperateur.get(nom) ?? { total: 0, nombre: 0 };
    ligne.total += deposit.amount;
    ligne.nombre += 1;
    parOperateur.set(nom, ligne);
  }
  const total = recus.reduce((somme, deposit) => somme + deposit.amount, 0);
  const enCours = deposits.filter((deposit) => EN_COURS.has(deposit.status)).length;

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Espace de modération
        </Link>
        <h1 className="text-3xl font-bold mt-4 mb-1">Paiements reçus</h1>
        <p className="text-muted-foreground mb-6">
          Chaque paiement passé par PawaPay, du plus récent au plus ancien. Les montants sont
          ceux payés par les clients : PawaPay retire sa commission avant de créditer votre
          compte. Les virements déclarés à la main se valident toujours dans l&apos;espace de
          modération.
        </p>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mb-6">
            Erreur de chargement : {error.message}
          </p>
        )}

        <section className="grid gap-3 sm:grid-cols-3 mb-8">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total reçu</p>
            <p className="text-2xl font-bold tabular-nums">{formatPrice(total)}</p>
            <p className="text-xs text-muted-foreground">
              {recus.length} paiement{recus.length > 1 ? "s" : ""}, avant commission
            </p>
          </div>
          {[...parOperateur.entries()].map(([nom, ligne]) => (
            <div key={nom} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Dont {nom}</p>
              <p className="text-2xl font-bold tabular-nums">{formatPrice(ligne.total)}</p>
              <p className="text-xs text-muted-foreground">
                {ligne.nombre} paiement{ligne.nombre > 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </section>

        {enCours > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-500 bg-amber-500/10 rounded-lg p-3 mb-6">
            {enCours} paiement{enCours > 1 ? "s" : ""} sans réponse définitive. « Vérifier
            auprès de PawaPay » redemande son état, et règle l&apos;achat s&apos;il a abouti.
          </p>
        )}

        <ul className="space-y-3">
          {deposits.map((deposit) => (
            <li key={deposit.deposit_id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-bold tabular-nums">{formatPrice(deposit.amount)}</p>
                <Etat status={deposit.status} />
              </div>
              <p className="font-medium">
                {ACHATS[deposit.purpose] ?? deposit.purpose}
                {details.get(deposit.target_id) && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {details.get(deposit.target_id)}
                  </span>
                )}
              </p>
              <p className="text-sm">
                Payé par {deposit.profile?.full_name ?? "un compte supprimé"}
                {deposit.profile?.role && ROLES[deposit.profile.role] && (
                  <span className="text-muted-foreground"> ({ROLES[deposit.profile.role]})</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {DATE.format(new Date(deposit.created_at))} · {operateur(deposit.provider)}
                {deposit.phone && <> · {deposit.phone}</>}
                {deposit.provider_transaction_id && (
                  <> · réf. opérateur {deposit.provider_transaction_id}</>
                )}
              </p>
              {deposit.status === "FAILED" && deposit.failure_code && (
                <p className="text-xs text-destructive mt-1">
                  Échec : {ECHECS[deposit.failure_code] ?? deposit.failure_code}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1 break-all">
                Identifiant PawaPay : {deposit.deposit_id}
              </p>
              {EN_COURS.has(deposit.status) && (
                <div className="mt-2">
                  <RecheckDepositButton depositId={deposit.deposit_id} />
                </div>
              )}
            </li>
          ))}
          {deposits.length === 0 && !error && (
            <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Aucun paiement PawaPay pour l&apos;instant.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Etat({ status }: { status: string }) {
  if (status === "COMPLETED") {
    return (
      <span className="text-xs font-medium rounded-full px-2.5 py-0.5 bg-green-600/10 text-green-700 dark:text-green-400">
        Reçu
      </span>
    );
  }
  if (EN_COURS.has(status)) {
    return (
      <span className="text-xs font-medium rounded-full px-2.5 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-500">
        En cours
      </span>
    );
  }
  return (
    <span className="text-xs font-medium rounded-full px-2.5 py-0.5 bg-destructive/10 text-destructive">
      Pas abouti
    </span>
  );
}

/**
 * Ce que chaque paiement a acheté, en une ligne : le titre de l'offre, le nom
 * du candidat, la formule. Quatre lectures groupées plutôt qu'une par paiement.
 */
async function describeTargets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deposits: Deposit[]
) {
  const ids = (purpose: Deposit["purpose"]) =>
    deposits.filter((deposit) => deposit.purpose === purpose).map((deposit) => deposit.target_id);
  const map = new Map<string, string>();

  const offres = ids("job_payment");
  const numerosEmployeur = ids("contact_unlock");
  const numerosCandidat = ids("candidate_unlock");
  const abonnements = ids("subscription");

  const [jobPayments, contactUnlocks, candidateUnlocks, subscriptions] = await Promise.all([
    offres.length
      ? supabase.from("job_payments").select("id, jobs(title)").in("id", offres)
      : null,
    numerosEmployeur.length
      ? supabase
          .from("contact_unlocks")
          .select("id, jobs(title, employer:profiles!jobs_employer_id_fkey(full_name))")
          .in("id", numerosEmployeur)
      : null,
    numerosCandidat.length
      ? supabase
          .from("candidate_unlocks")
          .select("id, candidate:profiles!candidate_unlocks_candidate_id_fkey(full_name)")
          .in("id", numerosCandidat)
      : null,
    abonnements.length
      ? supabase.from("subscriptions").select("id, plan_name").in("id", abonnements)
      : null,
  ]);

  type Titled = { id: string; jobs: { title: string } | null };
  for (const row of (jobPayments?.data ?? []) as unknown as Titled[]) {
    if (row.jobs?.title) map.set(row.id, `« ${row.jobs.title} »`);
  }
  type Unlock = {
    id: string;
    jobs: { title: string; employer: { full_name: string } | null } | null;
  };
  for (const row of (contactUnlocks?.data ?? []) as unknown as Unlock[]) {
    if (row.jobs?.title) {
      map.set(
        row.id,
        `offre « ${row.jobs.title} »${row.jobs.employer?.full_name ? ` de ${row.jobs.employer.full_name}` : ""}`
      );
    }
  }
  type CandidateRow = { id: string; candidate: { full_name: string } | null };
  for (const row of (candidateUnlocks?.data ?? []) as unknown as CandidateRow[]) {
    if (row.candidate?.full_name) map.set(row.id, row.candidate.full_name);
  }
  for (const row of (subscriptions?.data ?? []) as { id: string; plan_name: string }[]) {
    map.set(row.id, row.plan_name);
  }
  return map;
}
