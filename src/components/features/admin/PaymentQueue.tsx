import { BadgeCheck, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { settleBookingPayment } from "@/lib/admin/actions";
import { paymentReference } from "@/lib/payments/manual";

export type DeclaredPayment = {
  id: string;
  amount: number;
  currency: string;
  payment_method: string | null;
  payment_reference: string | null;
  payment_declared_at: string;
  employer: { full_name: string } | null;
  candidate: { full_name: string } | null;
};

function formatAmount(amount: number, currency: string) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} ${currency === "XAF" ? "FCFA" : currency}`;
}

function formatMoment(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PaymentQueue({
  payments,
  unavailable,
}: {
  payments: DeclaredPayment[];
  /** Set when the payment columns aren't in the database yet. */
  unavailable?: string | null;
}) {
  if (unavailable) {
    return (
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4">Paiements à vérifier</h2>
        <div className="bg-card border border-border rounded-2xl p-6 text-sm">
          <p className="font-medium mb-1">File des paiements indisponible.</p>
          <p className="text-muted-foreground">
            La migration <code className="font-mono">20260728000000_manual_mobile_money</code>{" "}
            n&apos;est pas encore appliquée sur cette base. Lancez{" "}
            <code className="font-mono">supabase db push</code> pour l&apos;activer.
          </p>
          <p className="text-muted-foreground/70 mt-2 font-mono text-xs">{unavailable}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-12">
      <h2 className="text-lg font-semibold mb-1">
        Paiements à vérifier{" "}
        <span className="text-muted-foreground font-normal">({payments.length})</span>
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        L&apos;employeur déclare avoir payé. Vérifiez le montant et l&apos;identifiant sur le
        relevé Mobile Money avant de confirmer — une confirmation débloque les coordonnées
        du candidat.
      </p>

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-6 text-center">
          Aucun paiement en attente de vérification.
        </p>
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => (
            <div
              key={payment.id}
              className="bg-card border border-border rounded-2xl p-5 shadow-soft flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary/15 text-secondary">
                <Wallet className="h-5 w-5" />
              </span>

              <div className="flex-1 min-w-0">
                <p className="font-semibold">
                  {formatAmount(payment.amount, payment.currency)}
                  <span className="ml-2 font-mono text-sm text-primary">
                    {paymentReference(payment.id)}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {payment.employer?.full_name ?? "Employeur"} →{" "}
                  {payment.candidate?.full_name ?? "Candidat"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Déclaré le {formatMoment(payment.payment_declared_at)} · identifiant{" "}
                  <span className="font-mono text-foreground">
                    {payment.payment_reference ?? "—"}
                  </span>
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                <form action={settleBookingPayment.bind(null, payment.id, true)}>
                  <Button type="submit" className="h-10 rounded-full gap-2 px-4">
                    <BadgeCheck className="h-4 w-4" />
                    Confirmer
                  </Button>
                </form>
                <form action={settleBookingPayment.bind(null, payment.id, false)}>
                  <Button
                    type="submit"
                    variant="ghost"
                    className="h-10 rounded-full gap-2 px-4 text-muted-foreground"
                    title="Efface la déclaration pour que l'employeur puisse la corriger"
                  >
                    <X className="h-4 w-4" />
                    Rejeter
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
