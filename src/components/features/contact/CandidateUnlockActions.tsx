"use client";

import { useActionState, useCallback, useEffect } from "react";
import { Loader2, LockOpen } from "lucide-react";
import { Link, useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { MomoPayment } from "@/components/features/payments/MomoPayment";
import {
  declareCandidateUnlockPayment,
  requestCandidateUnlock,
  type CandidateUnlockState,
} from "@/lib/contact/actions";
import { formatPrice } from "@/lib/subscriptions/plans";
import { CANDIDATE_UNLOCK_PRICE } from "@/lib/contact/unlock";

/**
 * « Payer pour avoir le numéro », à la place du numéro sur la fiche d'un
 * candidat. Crée la demande, puis la page affiche le paiement.
 */
export function CandidateUnlockButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CandidateUnlockState, FormData>(
    requestCandidateUnlock,
    {}
  );

  // La page se rafraîchit elle-même : un `revalidatePath` dans l'action
  // bloquerait sa réponse (voir src/lib/bookings/actions.ts).
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action}>
      <input type="hidden" name="candidateId" value={candidateId} />
      <Button type="submit" className="h-12 rounded-full px-6 gap-2" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
        Payer pour avoir le numéro · {formatPrice(CANDIDATE_UNLOCK_PRICE)}
      </Button>
      {state.error && (
        <p className="text-sm text-destructive mt-2">
          {state.error}
          {state.missingPhone && (
            <>
              {" "}
              <Link href="/profil" className="font-semibold underline">
                Ajouter mon numéro
              </Link>
            </>
          )}
        </p>
      )}
    </form>
  );
}

export function CandidateUnlockPayment({
  unlockId,
  declared,
}: {
  unlockId: string;
  declared: boolean;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const amountLabel = formatPrice(CANDIDATE_UNLOCK_PRICE);

  return (
    <MomoPayment
      action={declareCandidateUnlockPayment}
      idField="unlockId"
      id={unlockId}
      title="Régler le numéro du candidat"
      summary={
        <>
          Numéro de ce candidat · <strong>{amountLabel}</strong>, une seule fois.
        </>
      }
      amountLabel={amountLabel}
      purpose="le numéro d'un candidat"
      declared={declared}
      onDeclared={refresh}
      declaredText={
        <>
          Nous vérifions la transaction sur notre compte Mobile Money. Le numéro
          s&apos;affichera sur cette fiche dès validation, en général sous quelques heures.
        </>
      }
    />
  );
}
