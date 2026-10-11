"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { setApplicationStatus, type ApplicationState } from "@/lib/applications/actions";
import { APPLICATION_STATUSES, EMPLOYER_STATUS_LABELS } from "@/lib/applications/status";

/** Menu de l'employeur : choisir une étape l'enregistre aussitôt. */
export function ApplicationStatusSelect({
  applicationId,
  status,
}: {
  applicationId: string;
  status: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ApplicationState, FormData>(
    setApplicationStatus,
    {}
  );

  // Rafraîchi ici : un `revalidatePath` dans l'action bloquerait sa réponse.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form ref={form} action={action} className="flex items-center gap-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <label htmlFor={`status-${applicationId}`} className="sr-only">
        Étape de la candidature
      </label>
      <select
        id={`status-${applicationId}`}
        name="status"
        defaultValue={status}
        disabled={pending}
        onChange={() => form.current?.requestSubmit()}
        className="h-9 rounded-full border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {APPLICATION_STATUSES.map((value) => (
          <option key={value} value={value}>
            {EMPLOYER_STATUS_LABELS[value]}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}
