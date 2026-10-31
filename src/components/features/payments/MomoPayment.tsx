"use client";

import { useActionState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MOMO_OPERATORS,
  hasConfiguredOperator,
  paymentReference,
  whatsappReceiptLink,
} from "@/lib/payments/manual";
import { MobileMoneyPayment } from "@/components/features/payments/MobileMoneyPayment";
import type { Achat } from "@/lib/payments/actions";

type PaymentState = { error?: string; ok?: boolean };

type Props = {
  /** Lequel des quatre achats, pour que le paiement en ligne sache quoi régler. */
  achat: Achat;
  /** Server action recording the transaction id. */
  action: (previous: PaymentState, formData: FormData) => Promise<PaymentState>;
  /** Hidden field identifying the row being paid, e.g. `subscriptionId`. */
  idField: string;
  id: string;
  title: string;
  /** One line under the title: what is bought, and for how much. */
  summary: React.ReactNode;
  amountLabel: string;
  /** For the pre-filled WhatsApp message: « l'abonnement », « le numéro »… */
  purpose: string;
  /** Shown once paid — what happens next. */
  declaredText: React.ReactNode;
  /** Set once the buyer has already sent their transaction id. */
  declared: boolean;
  /** Called once the declaration is recorded, e.g. to refresh the page. */
  onDeclared?: () => void;
};

/**
 * Manual Mobile Money payment: where to send the money, the reference to quote,
 * and the field for the transaction id. Shared by everything the platform
 * charges for, so a buyer always sees the same steps.
 */
export function MomoPayment({
  achat,
  action,
  idField,
  id,
  title,
  summary,
  amountLabel,
  purpose,
  declaredText,
  declared,
  onDeclared,
}: Props) {
  const [state, formAction, pending] = useActionState<PaymentState, FormData>(action, {});

  useEffect(() => {
    if (state.ok) onDeclared?.();
  }, [state.ok, onDeclared]);

  // Same derivation as a booking's, so an admin reading the MoMo statement sees
  // one reference format for everything the platform charges for.
  const reference = paymentReference(id);
  const operators = MOMO_OPERATORS.filter((operator) => operator.number);
  // Null sans NEXT_PUBLIC_WHATSAPP_NUMBER : on n'affiche alors aucun lien plutôt
  // qu'un lien vers un numéro que personne n'a vérifié.
  const lienRecu = whatsappReceiptLink(reference, amountLabel, purpose);

  if (state.ok || declared) {
    return (
      <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft">
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <p className="font-semibold">Paiement déclaré</p>
        </div>
        <p className="text-sm text-muted-foreground">{declaredText}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft space-y-6">
      <div>
        <h2 className="font-semibold text-lg mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </div>

      {/* Le paiement en ligne d'abord : l'acheteur saisit son numéro, valide sur
          son téléphone, et c'est réglé — sans virement à faire soi-même, sans
          référence à recopier, sans attendre qu'une personne rapproche le
          versement d'un relevé. */}
      <MobileMoneyPayment achat={achat} targetId={id} amountLabel={amountLabel} />

      {/* Le virement manuel reste là, replié. Il sert quand PawaPay n'est pas
          encore activé sur le déploiement — l'action le dit alors clairement —
          et quand un paiement en ligne échoue pour une raison qui lui est
          propre. */}
      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          Payer autrement, par virement Mobile Money
        </summary>
        <div className="mt-4 space-y-6">
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
                  <input type="hidden" name={idField} value={id} />
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

          {lienRecu && (
            <p className="text-xs text-muted-foreground border-t border-border pt-4">
              Un souci ?{" "}
              <a
                href={lienRecu}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium hover:underline"
              >
                Envoyez-nous le reçu sur WhatsApp
              </a>
              .
            </p>
          )}
        </>
      ) : (
        // Better an honest gap than a plausible-looking wrong number.
        <div className="flex gap-3 text-sm bg-secondary/10 border border-secondary/40 rounded-lg p-4">
          <AlertTriangle className="h-5 w-5 text-secondary shrink-0" />
          <p>
            Aucun numéro Mobile Money n&apos;est configuré pour le moment.
            {lienRecu ? (
              <>
                {" "}
                <a
                  href={lienRecu}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-medium hover:underline"
                >
                  Contactez-nous sur WhatsApp
                </a>{" "}
                pour régler.
              </>
            ) : (
              " Contactez-nous pour régler."
            )}
          </p>
        </div>
      )}
        </div>
      </details>
    </div>
  );
}
