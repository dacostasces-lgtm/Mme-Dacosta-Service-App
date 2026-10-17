"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { submitReview, type ReviewState } from "@/lib/reviews/actions";

const NOTES = [1, 2, 3, 4, 5] as const;

export function ReviewForm({
  revieweeId,
  revieweeName,
  /** L'avis déjà laissé, s'il y en a un : le formulaire sert aussi à se relire. */
  existing,
}: {
  revieweeId: string;
  revieweeName: string;
  existing?: { rating: number; comment: string | null } | null;
}) {
  const action = submitReview.bind(null, revieweeId);
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(action, {});
  const [note, setNote] = useState(existing?.rating ?? 0);
  const router = useRouter();

  // Depuis ici, pas depuis l'action : un rafraîchissement déclenché côté
  // serveur retient la réponse, et le formulaire reste figé sur « Envoi… ».
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (state.ok) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" aria-hidden />
        <span>Merci, votre avis est enregistré.</span>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {/* La note part en champ caché : les étoiles sont des boutons, et un
          bouton dans un formulaire en déclencherait l'envoi. */}
      <input type="hidden" name="rating" value={note || ""} />

      <fieldset>
        <legend className="text-sm font-medium mb-1.5">
          Votre note pour {revieweeName}
        </legend>
        <div className="flex items-center gap-1">
          {NOTES.map((valeur) => (
            <button
              key={valeur}
              type="button"
              onClick={() => setNote(valeur)}
              aria-label={`${valeur} étoile${valeur > 1 ? "s" : ""} sur 5`}
              aria-pressed={note === valeur}
              className="p-1 rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Star
                className={`h-7 w-7 ${
                  valeur <= note
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40"
                }`}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`comment-${revieweeId}`} className="text-sm font-medium mb-1.5 block">
          Votre commentaire <span className="text-muted-foreground">(facultatif)</span>
        </label>
        <textarea
          id={`comment-${revieweeId}`}
          name="comment"
          rows={3}
          maxLength={1000}
          defaultValue={existing?.comment ?? ""}
          placeholder="Ponctualité, soin, relation avec les enfants…"
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Les numéros de téléphone sont refusés : les échanges passent par la messagerie.
        </p>
      </div>

      {state.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{state.error}</p>
      )}

      <Button type="submit" disabled={pending || note === 0} className="h-11 rounded-full px-6">
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        {pending ? "Envoi…" : existing ? "Corriger mon avis" : "Publier mon avis"}
      </Button>
    </form>
  );
}
