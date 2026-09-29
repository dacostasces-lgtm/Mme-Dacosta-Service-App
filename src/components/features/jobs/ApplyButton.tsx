"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyToJob, type ApplicationState } from "@/lib/applications/actions";

/**
 * Collapsed to a button until clicked: the offers page is a list, and a message
 * box on every card would bury the offers themselves.
 *
 * L'état « déjà postulé » se décide ici, pas dans la page. La page s'en
 * chargeait, et comme l'action révalide le layout, le serveur remplaçait ce
 * composant par sa ligne « vous avez déjà postulé » dans la seconde suivant
 * l'envoi : démonté, il emportait le « Candidature envoyée » que le candidat
 * n'avait pas eu le temps de lire — il agissait et ne voyait rien, sinon une
 * phrase qui se lit comme un refus. Les deux branches dans le même composant le
 * laissent monté, donc la confirmation tient jusqu'à ce qu'il quitte la page.
 */
export function ApplyButton({
  jobId,
  jobTitle,
  alreadyApplied = false,
}: {
  jobId: string;
  jobTitle: string;
  alreadyApplied?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ApplicationState, FormData>(applyToJob, {});

  // Avant `alreadyApplied` : au retour de l'action les deux sont vrais, et
  // c'est la confirmation qu'on doit voir, pas le constat.
  if (state.ok) {
    return (
      <p
        role="status"
        className="mt-5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-500/10 rounded-lg p-3 flex items-center gap-2"
      >
        <Check className="h-4 w-4 shrink-0" />
        Candidature envoyée. L&apos;employeur peut désormais vous contacter.
      </p>
    );
  }

  if (alreadyApplied) {
    return (
      <p className="mt-5 text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
        Vous avez déjà postulé à cette offre.
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="rounded-full gap-2 mt-5"
        onClick={() => setOpen(true)}
      >
        <Send className="h-4 w-4" />
        Postuler
      </Button>
    );
  }

  return (
    <form action={formAction} className="mt-5 space-y-3">
      <input type="hidden" name="jobId" value={jobId} />
      <label htmlFor={`message-${jobId}`} className="text-sm font-medium block">
        Votre message <span className="text-muted-foreground font-normal">(facultatif)</span>
      </label>
      <textarea
        id={`message-${jobId}`}
        name="message"
        rows={4}
        placeholder={`Expliquez en quelques lignes pourquoi le poste « ${jobTitle} » vous correspond.`}
        className="w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      />

      {state.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{state.error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" className="rounded-full gap-2" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {pending ? "Envoi..." : "Envoyer ma candidature"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
