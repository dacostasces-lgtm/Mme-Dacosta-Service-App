import { BadgeCheck, Lock, Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { firstPayment, JOB_PRICE, type JobPaymentRow } from "@/lib/jobs/payment";
import { formatPrice } from "@/lib/subscriptions/plans";
import { cn } from "@/lib/utils";

/**
 * Sur sa propre offre, l'employeur voit sa formule et peut payer d'ici.
 * Rien ne s'affiche pour les autres visiteurs : la page appelante ne le rend
 * que pour le propriétaire.
 */
export async function JobOwnerPayment({ jobId }: { jobId: string }) {
  const supabase = await createClient();
  const [{ data: paid, error }, { data: payments }] = await Promise.all([
    supabase.rpc("job_is_paid", { p_job_id: jobId }),
    supabase
      .from("job_payments")
      .select("id, status, payment_declared_at")
      .eq("job_id", jobId),
  ]);

  // Migration absente : on ne propose pas un paiement qui échouerait.
  if (error) return null;

  const payment = firstPayment((payments ?? []) as JobPaymentRow[]);

  if (paid) {
    return (
      <section className="mt-6 rounded-2xl border border-green-600/30 bg-green-500/10 p-5">
        <p className="font-semibold flex items-center gap-2 mb-1">
          <BadgeCheck className="h-5 w-5 text-green-700 dark:text-green-400" aria-hidden />
          Offre payante
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          Vous recevez le numéro de téléphone de chaque candidat qui postule.
        </p>
        <Link
          href="/dashboard/employer#candidatures"
          className={cn(buttonVariants({ variant: "outline" }), "rounded-full gap-2")}
        >
          <Phone className="h-4 w-4" />
          Voir mes candidatures
        </Link>
      </section>
    );
  }

  const pending = payment?.status === "pending_payment";

  return (
    <section className="mt-6 rounded-2xl border-2 border-secondary/60 bg-secondary/10 p-5">
      <p className="font-semibold flex items-center gap-2 mb-1">
        <Lock className="h-5 w-5 text-secondary" aria-hidden />
        {pending ? "Paiement de l'offre en cours" : "Offre gratuite"}
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        {pending
          ? payment?.payment_declared_at
            ? "Nous vérifions votre paiement. Dès validation, le numéro de chaque candidat s'affichera dans vos candidatures."
            : "Il reste à régler le paiement par Mobile Money pour recevoir le numéro des candidats."
          : `Vous recevez les candidatures sans le numéro des candidats. Passez cette offre en payante pour ${formatPrice(JOB_PRICE)}, une seule fois, et appelez-les directement.`}
      </p>
      <Link
        href={`/offres/${jobId}/payer`}
        className={cn(buttonVariants(), "rounded-full gap-2")}
      >
        <Phone className="h-4 w-4" />
        {pending
          ? payment?.payment_declared_at
            ? "Voir le paiement"
            : "Régler le paiement"
          : `Passer en payante · ${formatPrice(JOB_PRICE)}`}
      </Link>
    </section>
  );
}
