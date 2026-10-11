import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { JobPayment, RequestJobPaymentButton } from "@/components/features/jobs/JobPaymentActions";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { firstPayment, JOB_PRICE, type JobPaymentRow } from "@/lib/jobs/payment";
import { formatPrice } from "@/lib/subscriptions/plans";

export const metadata: Metadata = {
  title: "Offre payante",
  robots: { index: false, follow: false },
};

type Job = {
  id: string;
  title: string;
  employer_id: string;
  job_payments: JobPaymentRow | JobPaymentRow[] | null;
};

/**
 * Passer une offre en payante, et la régler. On y arrive juste après la
 * publication si la formule payante a été choisie, ou depuis « Mes offres ».
 */
export default async function PayJobPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser({ role: "employer" })]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data }, { data: paidData }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, employer_id, job_payments(id, status, payment_declared_at)")
      .eq("id", id)
      .eq("employer_id", user.profileId ?? "")
      .maybeSingle(),
    supabase.rpc("job_is_paid", { p_job_id: id }),
  ]);

  const job = data as unknown as Job | null;
  if (!job) notFound();

  const payment = firstPayment(job.job_payments);
  const paid = Boolean(paidData);

  return (
    <div className="flex-1 bg-surface bg-grain py-10 sm:py-14">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href="/dashboard/employer"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Mon tableau de bord
        </Link>

        <h1 className="text-3xl font-bold mt-4 mb-2">Offre payante</h1>
        <p className="text-muted-foreground mb-8">
          « {job.title} » est publiée. En formule payante, vous recevez le numéro de téléphone de
          chaque candidat qui y postule, pour l&apos;appeler directement — sauf ceux qui
          n&apos;en ont pas renseigné, à qui vous répondez par la messagerie. Un numéro qui
          n&apos;a pas été confirmé par SMS est signalé.
        </p>

        {paid ? (
          <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft">
            <div className="flex items-center gap-3 mb-2">
              <BadgeCheck className="h-6 w-6 text-secondary shrink-0" />
              <p className="font-semibold text-lg">Cette offre est payante</p>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              {payment?.status === "active"
                ? "Votre paiement a été validé."
                : "Elle est incluse dans votre abonnement Premium Employeur."}{" "}
              Le numéro de chaque candidat s&apos;affiche dans vos candidatures reçues.
            </p>
            <Link
              href="/dashboard/employer#candidatures"
              className={buttonVariants({ className: "rounded-full gap-2" })}
            >
              <Phone className="h-4 w-4" />
              Voir mes candidatures
            </Link>
          </div>
        ) : payment?.status === "pending_payment" ? (
          <JobPayment
            paymentId={payment.id}
            jobTitle={job.title}
            declared={Boolean(payment.payment_declared_at)}
          />
        ) : (
          <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft">
            <p className="text-sm text-muted-foreground mb-5">
              {payment?.status === "rejected"
                ? "Votre dernier paiement n'a pas pu être vérifié. Vous pouvez relancer la demande."
                : `Cette offre est en formule gratuite. Passez-la en payante pour ${formatPrice(JOB_PRICE)}, une seule fois.`}
            </p>
            <RequestJobPaymentButton jobId={job.id} />
          </div>
        )}
      </div>
    </div>
  );
}
