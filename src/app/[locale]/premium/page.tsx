import type { Metadata } from "next";
import { BadgeCheck, Clock } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { SubscriptionPayment } from "@/components/features/subscriptions/SubscriptionPayment";
import { formatPrice } from "@/lib/subscriptions/plans";

export const metadata: Metadata = {
  title: "Mon abonnement Premium",
  robots: { index: false, follow: false },
};

type Subscription = {
  id: string;
  plan_name: string;
  price: number;
  status: string;
  payment_declared_at: string | null;
  end_date: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PremiumPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // RLS scopes this to the caller's own rows.
  const { data } = await supabase
    .from("subscriptions")
    .select("id, plan_name, price, status, payment_declared_at, end_date")
    .order("created_at", { ascending: false })
    .limit(1);

  const subscription = (data ?? [])[0] as Subscription | undefined;

  return (
    <div className="flex-1 bg-surface bg-grain py-10 sm:py-14">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-2">Mon abonnement Premium</h1>
        <p className="text-muted-foreground mb-8">Bonjour {user.fullName}</p>

        {user.isPremium && subscription?.status === "active" ? (
          <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft">
            <div className="flex items-center gap-3 mb-2">
              <BadgeCheck className="h-6 w-6 text-secondary shrink-0" />
              <p className="font-semibold text-lg">{subscription.plan_name} actif</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {subscription.end_date
                ? `Votre abonnement est valable jusqu'au ${formatDate(subscription.end_date)}.`
                : "Votre abonnement est actif."}{" "}
              Votre profil est mis en avant dans les résultats de recherche.
            </p>
          </div>
        ) : subscription?.status === "pending_payment" ? (
          <SubscriptionPayment
            subscriptionId={subscription.id}
            planName={subscription.plan_name}
            amountLabel={formatPrice(subscription.price)}
            declared={Boolean(subscription.payment_declared_at)}
          />
        ) : (
          <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="h-6 w-6 text-muted-foreground shrink-0" />
              <p className="font-semibold">Aucun abonnement en cours</p>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              {subscription?.status === "rejected"
                ? "Votre dernier paiement n'a pas pu être vérifié. Vous pouvez relancer une demande depuis nos offres."
                : "Passez Premium pour être mis en avant auprès des familles."}
            </p>
            <Link href="/pricing" className={buttonVariants({ className: "rounded-full" })}>
              Voir les offres
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
