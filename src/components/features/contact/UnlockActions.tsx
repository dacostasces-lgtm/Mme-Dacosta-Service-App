"use client";

import { useActionState, useCallback, useEffect } from "react";
import { Loader2, LockOpen } from "lucide-react";
import { Link, useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { MomoPayment } from "@/components/features/payments/MomoPayment";
import {
  declareContactUnlockPayment,
  requestContactUnlock,
  type UnlockState,
} from "@/lib/contact/actions";
import { formatPrice } from "@/lib/subscriptions/plans";
import { UNLOCK_PRICE } from "@/lib/contact/unlock";

/** « Débloquer ce numéro » : crée la demande, puis la page affiche le paiement. */
export function UnlockButton({
  jobId,
  next,
  size = "default",
}: {
  jobId: string;
  /** Page où aller une fois la demande créée — depuis la liste des offres,
   *  celle de l'offre, qui affiche le paiement. Sinon, la page se rafraîchit. */
  next?: string;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<UnlockState, FormData>(requestContactUnlock, {});

  // La page se rafraîchit elle-même : un `revalidatePath` dans l'action
  // bloquerait sa réponse (voir src/lib/bookings/actions.ts).
  useEffect(() => {
    if (!state.ok) return;
    if (next) router.push(next);
    else router.refresh();
  }, [state.ok, router, next]);

  return (
    <form action={action}>
      <input type="hidden" name="jobId" value={jobId} />
      <Button
        type="submit"
        size={size}
        className={size === "sm" ? "rounded-full gap-1.5 h-9 px-4" : "rounded-full gap-2 w-full sm:w-auto"}
        disabled={pending}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
        Débloquer ce numéro · {formatPrice(UNLOCK_PRICE)}
      </Button>
      {state.error && (
        <p className="text-sm text-destructive mt-2">
          {state.error}
          {state.incompleteProfile && (
            <>
              {" "}
              <Link href="/profil" className="font-semibold underline">
                Compléter mon profil
              </Link>
            </>
          )}
        </p>
      )}
    </form>
  );
}

export function UnlockPayment({
  unlockId,
  price,
  declared,
}: {
  unlockId: string;
  price: number;
  declared: boolean;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const amountLabel = formatPrice(price);

  return (
    <MomoPayment
      achat="contact_unlock"
      action={declareContactUnlockPayment}
      idField="unlockId"
      id={unlockId}
      title="Régler le déblocage du numéro"
      summary={
        <>
          Numéro de l&apos;employeur pour cette offre · <strong>{amountLabel}</strong>, une seule
          fois.
        </>
      }
      amountLabel={amountLabel}
      purpose="le numéro d'employeur"
      declared={declared}
      onDeclared={refresh}
      declaredText={
        <>
          Nous vérifions la transaction sur notre compte Mobile Money. Le numéro
          s&apos;affichera ici dès validation — en général sous quelques heures. Vous le
          retrouverez aussi sur votre tableau de bord.
        </>
      }
    />
  );
}
