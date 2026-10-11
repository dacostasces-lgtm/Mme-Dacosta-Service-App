import { Check, LockOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { settleCandidateUnlock } from "@/lib/contact/actions";
import { formatPrice } from "@/lib/subscriptions/plans";
import { paymentReference } from "@/lib/payments/manual";

export type DeclaredCandidateUnlock = {
  id: string;
  price: number;
  payment_reference: string | null;
  payment_declared_at: string | null;
  employer: { full_name: string } | null;
  candidate: { full_name: string } | null;
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
 * Numéros de candidat dont l'employeur dit avoir payé. Confirmer lui montre le
 * numéro sur la fiche du candidat : ne le faire qu'après avoir vu le versement
 * sur le relevé Mobile Money, sous la référence indiquée.
 */
export function CandidateUnlockQueue({ unlocks }: { unlocks: DeclaredCandidateUnlock[] }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <LockOpen className="h-5 w-5 text-secondary" />
        Numéros de candidats à débloquer{" "}
        <span className="text-muted-foreground font-normal">({unlocks.length})</span>
      </h2>

      {unlocks.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-6 text-center">
          Aucun paiement de numéro de candidat en attente.
        </p>
      ) : (
        <ul className="space-y-3">
          {unlocks.map((unlock) => (
            <li
              key={unlock.id}
              className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {unlock.employer?.full_name ?? "Employeur"}
                  <span className="text-muted-foreground font-normal">
                    {" · numéro de "}
                    {unlock.candidate?.full_name ?? "Candidat"}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatPrice(unlock.price)} · référence {paymentReference(unlock.id)}
                  {unlock.payment_declared_at &&
                    ` · déclaré le ${formatMoment(unlock.payment_declared_at)}`}
                </p>
                {unlock.payment_reference && (
                  <p className="font-mono text-sm mt-1">{unlock.payment_reference}</p>
                )}
              </div>

              <div className="flex gap-2 shrink-0">
                <form action={settleCandidateUnlock.bind(null, unlock.id, true)}>
                  <Button type="submit" size="sm" className="rounded-full gap-1.5">
                    <Check className="h-4 w-4" />
                    Confirmer
                  </Button>
                </form>
                <form action={settleCandidateUnlock.bind(null, unlock.id, false)}>
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
