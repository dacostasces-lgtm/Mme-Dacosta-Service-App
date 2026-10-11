import { Briefcase, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { settleJobPayment } from "@/lib/jobs/actions";
import { formatPrice } from "@/lib/subscriptions/plans";
import { paymentReference } from "@/lib/payments/manual";

export type DeclaredJobPayment = {
  id: string;
  price: number;
  payment_reference: string | null;
  payment_declared_at: string | null;
  employer: { full_name: string } | null;
  jobs: { title: string } | null;
};

function formatMoment(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Offres payantes dont l'employeur dit avoir payé. Confirmer lui montre le
 * numéro de chaque candidat : ne le faire qu'après avoir vu le versement sur
 * le relevé Mobile Money, sous la référence indiquée.
 */
export function JobPaymentQueue({ payments }: { payments: DeclaredJobPayment[] }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Briefcase className="h-5 w-5 text-secondary" />
        Offres payantes à confirmer{" "}
        <span className="text-muted-foreground font-normal">({payments.length})</span>
      </h2>

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-6 text-center">
          Aucun paiement d&apos;offre en attente.
        </p>
      ) : (
        <ul className="space-y-3">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {payment.employer?.full_name ?? "Employeur"}
                  <span className="text-muted-foreground font-normal">
                    {" · "}
                    {payment.jobs?.title ?? "Offre"}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatPrice(payment.price)} · référence {paymentReference(payment.id)}
                  {payment.payment_declared_at &&
                    ` · déclaré le ${formatMoment(payment.payment_declared_at)}`}
                </p>
                {payment.payment_reference && (
                  <p className="font-mono text-sm mt-1">{payment.payment_reference}</p>
                )}
              </div>

              <div className="flex gap-2 shrink-0">
                <form action={settleJobPayment.bind(null, payment.id, true)}>
                  <Button type="submit" size="sm" className="rounded-full gap-1.5">
                    <Check className="h-4 w-4" />
                    Confirmer
                  </Button>
                </form>
                <form action={settleJobPayment.bind(null, payment.id, false)}>
                  <Button type="submit" size="sm" variant="outline" className="rounded-full gap-1.5">
                    <X className="h-4 w-4" />
                    Rejeter
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
