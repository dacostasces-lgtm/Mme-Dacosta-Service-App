"use client";

import { MomoPayment } from "@/components/features/payments/MomoPayment";
import { declareSubscriptionPayment } from "@/lib/subscriptions/actions";

type Props = {
  subscriptionId: string;
  planName: string;
  amountLabel: string;
  /** Set once the buyer has already sent their transaction id. */
  declared: boolean;
};

export function SubscriptionPayment({ subscriptionId, planName, amountLabel, declared }: Props) {
  return (
    <MomoPayment
      action={declareSubscriptionPayment}
      idField="subscriptionId"
      id={subscriptionId}
      title="Régler votre abonnement"
      summary={
        <>
          {planName} · <strong>{amountLabel}</strong> pour un mois.
        </>
      }
      amountLabel={amountLabel}
      purpose="l'abonnement"
      declared={declared}
      declaredText={
        <>
          Nous vérifions la transaction sur notre compte Mobile Money. Votre abonnement{" "}
          <strong>{planName}</strong> sera activé dès validation — en général sous quelques
          heures. Vous n&apos;avez rien d&apos;autre à faire.
        </>
      }
    />
  );
}
