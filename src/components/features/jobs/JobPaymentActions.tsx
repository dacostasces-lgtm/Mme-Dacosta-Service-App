"use client";

import { useActionState, useCallback, useEffect } from "react";
import { Loader2, Phone } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { MomoPayment } from "@/components/features/payments/MomoPayment";
import {
  declareJobPayment,
  requestJobPayment,
  type JobStatusState,
} from "@/lib/jobs/actions";
import { formatPrice } from "@/lib/subscriptions/plans";
import { JOB_PRICE } from "@/lib/jobs/payment";

/** « Passer en payante » : crée la demande, puis la page affiche le paiement. */
export function RequestJobPaymentButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<JobStatusState, FormData>(requestJobPayment, {});

  // Rafraîchi ici : un `revalidatePath` dans l'action bloquerait sa réponse.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action}>
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" className="rounded-full gap-2" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
        Passer en payante · {formatPrice(JOB_PRICE)}
      </Button>
      {state.error && <p className="text-sm text-destructive mt-2">{state.error}</p>}
    </form>
  );
}

export function JobPayment({
  paymentId,
  jobTitle,
  declared,
}: {
  paymentId: string;
  jobTitle: string;
  declared: boolean;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const amountLabel = formatPrice(JOB_PRICE);

  return (
    <MomoPayment
      action={declareJobPayment}
      idField="paymentId"
      id={paymentId}
      title="Régler votre offre payante"
      summary={
        <>
          « {jobTitle} » · <strong>{amountLabel}</strong>, une fois pour toute la durée de
          l&apos;offre.
        </>
      }
      amountLabel={amountLabel}
      purpose="l'offre payante"
      declared={declared}
      onDeclared={refresh}
      declaredText={
        <>
          Nous vérifions la transaction sur notre compte Mobile Money. Dès validation — en
          général sous quelques heures — le numéro de chaque candidat s&apos;affichera dans vos
          candidatures reçues, y compris ceux qui ont déjà postulé.
        </>
      }
    />
  );
}
