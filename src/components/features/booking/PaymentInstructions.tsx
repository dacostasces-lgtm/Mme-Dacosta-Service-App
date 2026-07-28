"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { declareBookingPayment, type DeclareState } from "@/lib/bookings/actions";
import {
  MOMO_OPERATORS,
  hasConfiguredOperator,
  paymentReference,
  whatsappReceiptLink,
} from "@/lib/payments/manual";

type Props = {
  bookingId: string;
  amountLabel: string;
};

export function PaymentInstructions({ bookingId, amountLabel }: Props) {
  const [state, formAction, pending] = useActionState<DeclareState, FormData>(
    declareBookingPayment,
    {}
  );

  const reference = paymentReference(bookingId);
  const operators = MOMO_OPERATORS.filter((operator) => operator.number);

  if (state.ok) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 text-left max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <p className="font-semibold">Paiement déclaré</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Nous vérifions la transaction sur notre compte Mobile Money. Vous recevrez la
          confirmation et les coordonnées du candidat dès validation — en général sous
          quelques heures.
        </p>
      </div>
    );
  }

  return (
    <div className="text-left max-w-md mx-auto space-y-5">
      <div className="bg-surface border border-border rounded-2xl p-5">
        <p className="text-sm text-muted-foreground mb-4">
          Effectuez le transfert de{" "}
          <span className="font-semibold text-foreground">{amountLabel}</span> depuis votre
          téléphone, en indiquant la référence ci-dessous.
        </p>

        <dl className="space-y-3 text-sm">
          {hasConfiguredOperator() ? (
            operators.map((operator) => (
              <div key={operator.id} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground flex items-center gap-2">
                  <Smartphone className="h-4 w-4" aria-hidden />
                  {operator.label}
                  <span className="text-xs">({operator.ussd})</span>
                </dt>
                <dd className="font-mono font-semibold tabular-nums">{operator.number}</dd>
              </div>
            ))
          ) : (
            // Better an honest gap than a plausible-looking wrong number.
            <div className="flex gap-3 text-amber-700 dark:text-amber-500">
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
              <p>
                Aucun numéro Mobile Money n&apos;est configuré. Contactez-nous par WhatsApp
                pour régler la mise en relation.
              </p>
            </div>
          )}

          <div className="flex items-baseline justify-between gap-3 pt-3 border-t border-border">
            <dt className="text-muted-foreground">Référence à indiquer</dt>
            <dd className="font-mono font-bold text-primary">{reference}</dd>
          </div>
        </dl>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <label htmlFor="reference" className="text-sm font-medium block">
          Identifiant de la transaction
          <span className="block text-xs font-normal text-muted-foreground mt-0.5">
            Recopiez le code reçu dans le SMS de confirmation Mobile Money.
          </span>
        </label>
        <Input
          id="reference"
          name="reference"
          required
          maxLength={64}
          autoComplete="off"
          placeholder="Ex : MP260728.1432.A12345"
        />

        {state.error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="w-full h-11 rounded-full gap-2"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          J&apos;ai payé, déclarer la transaction
        </Button>
      </form>

      <p className="text-xs text-muted-foreground text-center">
        Un souci ?{" "}
        <a
          href={whatsappReceiptLink(reference, amountLabel)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium"
        >
          Envoyez-nous le reçu par WhatsApp
        </a>
      </p>
    </div>
  );
}
