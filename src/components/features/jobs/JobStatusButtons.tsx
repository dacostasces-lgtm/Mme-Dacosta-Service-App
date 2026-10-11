"use client";

import { useActionState, useEffect } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { closeJob, renewJob, type JobStatusState } from "@/lib/jobs/actions";

/**
 * Les deux réponses à « Votre offre est-elle toujours disponible ? ».
 *
 * La page se rafraîchit ici plutôt que par `revalidatePath` dans l'action, qui
 * bloquerait la réponse (voir src/lib/bookings/actions.ts).
 */
export function JobStatusButtons({ jobId, canClose = true }: { jobId: string; canClose?: boolean }) {
  const router = useRouter();
  const [renewState, renew, renewing] = useActionState<JobStatusState, FormData>(renewJob, {});
  const [closeState, close, closing] = useActionState<JobStatusState, FormData>(closeJob, {});

  useEffect(() => {
    if (renewState.ok || closeState.ok) router.refresh();
  }, [renewState, closeState, router]);

  const error = renewState.error ?? closeState.error;
  const busy = renewing || closing;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <form action={renew}>
          <input type="hidden" name="jobId" value={jobId} />
          <Button type="submit" size="sm" className="rounded-full gap-1.5" disabled={busy}>
            {renewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Toujours disponible
          </Button>
        </form>
        {canClose && (
          <form action={close}>
            <input type="hidden" name="jobId" value={jobId} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="rounded-full gap-1.5"
              disabled={busy}
            >
              {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Poste pourvu
            </Button>
          </form>
        )}
      </div>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}
