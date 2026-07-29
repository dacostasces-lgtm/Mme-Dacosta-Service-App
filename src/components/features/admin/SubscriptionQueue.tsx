import { BadgeCheck, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { settleSubscription } from "@/lib/subscriptions/actions";
import { formatPrice } from "@/lib/subscriptions/plans";

export type DeclaredSubscription = {
  id: string;
  plan_name: string;
  price: number;
  payment_reference: string | null;
  payment_declared_at: string | null;
  profiles: { full_name: string; role: string } | null;
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
 * Premium requests whose buyer says they have paid.
 *
 * Confirming grants the badge, so the only honest basis for pressing it is
 * having seen the amount land on the Mobile Money statement — the reference
 * below is what to look for there.
 */
export function SubscriptionQueue({ subscriptions }: { subscriptions: DeclaredSubscription[] }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <BadgeCheck className="h-5 w-5 text-secondary" />
        Abonnements à confirmer{" "}
        <span className="text-muted-foreground font-normal">({subscriptions.length})</span>
      </h2>

      {subscriptions.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-6 text-center">
          Aucun paiement d&apos;abonnement en attente.
        </p>
      ) : (
        <ul className="space-y-3">
          {subscriptions.map((subscription) => (
            <li
              key={subscription.id}
              className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {subscription.profiles?.full_name ?? "Utilisateur"}
                  <span className="text-muted-foreground font-normal">
                    {" · "}
                    {subscription.plan_name}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatPrice(subscription.price)}
                  {subscription.payment_declared_at &&
                    ` · déclaré le ${formatMoment(subscription.payment_declared_at)}`}
                </p>
                {subscription.payment_reference && (
                  <p className="font-mono text-sm mt-1">{subscription.payment_reference}</p>
                )}
              </div>

              <div className="flex gap-2 shrink-0">
                <form action={settleSubscription.bind(null, subscription.id, true)}>
                  <Button type="submit" size="sm" className="rounded-full gap-1.5">
                    <Check className="h-4 w-4" />
                    Confirmer
                  </Button>
                </form>
                <form action={settleSubscription.bind(null, subscription.id, false)}>
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
