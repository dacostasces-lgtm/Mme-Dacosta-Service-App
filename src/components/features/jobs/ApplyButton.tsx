"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyToJob, type ApplicationState } from "@/lib/applications/actions";

/**
 * Collapsed to a button until clicked: the offers page is a list, and a message
 * box on every card would bury the offers themselves.
 */
export function ApplyButton({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ApplicationState, FormData>(applyToJob, {});

  if (state.ok) {
    return (
      <p className="mt-5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-500/10 rounded-lg p-3 flex items-center gap-2">
        <Check className="h-4 w-4 shrink-0" />
        Candidature envoyée. L&apos;employeur peut désormais vous contacter.
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
