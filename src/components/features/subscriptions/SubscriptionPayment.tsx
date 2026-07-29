"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  declareSubscriptionPayment,
  type SubscriptionState,
} from "@/lib/subscriptions/actions";
import {
  MOMO_OPERATORS,
  hasConfiguredOperator,
  paymentReference,
  whatsappReceiptLink,
} from "@/lib/payments/manual";

type Props = {
  subscriptionId: string;
  planName: string;
  amountLabel: string;
  /** Set once the buyer has already sent their transaction id. */
  declared: boolean;
};

export function SubscriptionPayment({
  subscriptionId,
  planName,
  amountLabel,
  declared,
}: Props) {
  const [state, formAction, pending] = useActionState<SubscriptionState, FormData>(
    declareSubscriptionPayment,
    {}
  );

  // Same derivation as a booking's, so an admin reading the MoMo statement sees
  // one reference format for everything the platform charges for.
  const reference = paymentReference(subscriptionId);
  const operators = MOMO_OPERATORS.filter((operator) => operator.number);

  if (state.ok || declared) {
    return (
      <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft">
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <p className="font-semibold">Paiement déclaré</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Nous vérifions la transaction sur notre compte Mobile Money. Votre abonnement
          {" "}<strong>{planName}</strong> sera activé dès validation — en général sous quelques
          heures. Vous n&apos;avez rien d&apos;autre à faire.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft space-y-6">
      <div>
        <h2 className="font-semibold text-lg mb-1">Régler votre abonnement</h2>
        <p className="text-sm text-muted-foreground">
          {planName} · <strong>{amountLabel}</strong> pour un mois.
        </p>
      </div>

      {hasConfiguredOperator() ? (
        <>
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold shrink-0">
                1
              </span>
              <div>
                <p className="font-medium mb-2">Envoyez {amountLabel} à l&apos;un de ces numéros</p>
                <dl className="space-y-2">
                  {operators.map((operator) => (
                    <div
                      key={operator.id}
                      className="flex items-center justify-between gap-4 bg-surface rounded-lg px-3 py-2"
                    >
                      <dt className="flex items-center gap-2 text-muted-foreground">
                        <Smartphone className="h-4 w-4" aria-hidden />
                        {operator.label}
                        <span className="text-xs">({operator.ussd})</span>
                      </dt>
                      <dd className="font-mono font-semibold tabular-nums">{operator.number}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold shrink-0">
                2
              </span>
              <div>
                <p className="font-medium mb-1">Indiquez cette référence dans le motif</p>
                <p className="font-mono text-lg font-bold text-primary">{reference}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  C&apos;est ce qui nous permet de relier votre versement à votre compte.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold shrink-0">
                3
              </span>
              <div className="w-full">
                <p className="font-medium mb-2">
                  Recopiez l&apos;identifiant de transaction reçu par SMS
                </p>
                <form action={formAction} className="space-y-3">
                  <input type="hidden" name="subscriptionId" value={subscriptionId} />
                  <Input
                    name="reference"
                    placeholder="Ex : PP250728.1234.A56789"
                    required
                    aria-label="Identifiant de transaction Mobile Money"
                  />
                  {state.error && (
                    <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                      {state.error}
                    </p>
                  )}
                  <Button type="submit" className="rounded-full gap-2" disabled={pending}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {pending ? "Envoi..." : "J'ai payé"}
                  </Button>
                </form>
              </div>
            </li>
          </ol>

          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            Un souci ?{" "}
            <a
              href={whatsappReceiptLink(reference, amountLabel)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium hover:underline"
            >
              Envoyez-nous le reçu sur WhatsApp
            </a>
            .
          </p>
        </>
      ) : (
        // Better an honest gap than a plausible-looking wrong number.
        <div className="flex gap-3 text-sm bg-secondary/10 border border-secondary/40 rounded-lg p-4">
          <AlertTriangle className="h-5 w-5 text-secondary shrink-0" />
          <p>
            Aucun numéro Mobile Money n&apos;est configuré pour le moment.{" "}
            <a
              href={whatsappReceiptLink(reference, amountLabel)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium hover:underline"
            >
              Contactez-nous sur WhatsApp
            </a>{" "}
            pour régler votre abonnement.
          </p>
        </div>
      )}
    </div>
  );
}
