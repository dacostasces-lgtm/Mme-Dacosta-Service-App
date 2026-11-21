"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitWithoutReset } from "@/lib/forms";
import { deleteMyAccount, type DeleteAccountState } from "@/lib/profile/delete-account";

const CONFIRMATION = "SUPPRIMER";

/**
 * « Supprimer mon compte », en bas du profil. Deux gestes : ouvrir, puis
 * écrire SUPPRIMER — un toucher par erreur ne doit rien effacer.
 */
export function DeleteAccount({ isEmployer }: { isEmployer: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteMyAccount, {});

  // Au succès, l'action redirige elle-même vers « Votre compte a été supprimé ».
  const confirmed = typed.trim().toUpperCase() === CONFIRMATION;

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-destructive" />
          Supprimer mon compte
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {isEmployer
            ? "Votre profil, vos coordonnées et vos messages sont effacés, et vos offres retirées."
            : "Votre profil, vos coordonnées, vos pièces, vos candidatures et vos messages sont effacés."}{" "}
          Les paiements déjà faits restent enregistrés, sans votre nom, comme la loi l&apos;exige.
          Un abonnement Premium en cours est perdu. C&apos;est définitif.
        </p>
      </div>

      {!open ? (
        <Button
          type="button"
          variant="ghost"
          className="rounded-full gap-2 text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Supprimer mon compte
        </Button>
      ) : (
        <form action={action} onSubmit={submitWithoutReset(action)} className="space-y-3">
          <div>
            <label htmlFor="confirmation" className="text-sm font-medium mb-1 block">
              Pour confirmer, écrivez {CONFIRMATION}
            </label>
            <Input
              id="confirmation"
              name="confirmation"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="destructive"
              className="rounded-full gap-2"
              disabled={!confirmed || pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Supprimer définitivement
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              disabled={pending}
            >
              Annuler
            </Button>
          </div>
          {state.error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{state.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
