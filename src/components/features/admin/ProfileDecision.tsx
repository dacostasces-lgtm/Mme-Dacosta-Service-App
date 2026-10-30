"use client";

import { useActionState, useEffect, useState } from "react";
import { Ban, Loader2, PhoneCall, RotateCcw, ShieldCheck, Undo2, type LucideIcon } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitWithoutReset } from "@/lib/forms";
import {
  confirmPhoneByCall,
  rejectProfile,
  restoreProfile,
  setProfileValidation,
  type ProfileDecisionState,
} from "@/lib/admin/actions";

type DecisionAction = (
  previous: ProfileDecisionState,
  formData: FormData
) => Promise<ProfileDecisionState>;

/**
 * Un bouton de la file de modération.
 *
 * La page se rafraîchit ici plutôt que par `revalidatePath` dans l'action, qui
 * bloquerait la réponse (voir src/lib/bookings/actions.ts) : le profil était
 * bien publié, mais l'écran ne bougeait pas.
 */
function DecisionButton({
  action: decide,
  fields,
  icon: Icon,
  label,
  variant = "default",
}: {
  action: DecisionAction;
  fields: Record<string, string>;
  icon: LucideIcon;
  label: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProfileDecisionState, FormData>(decide, {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="shrink-0">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        type="submit"
        variant={variant}
        className="h-10 rounded-full px-4 gap-2"
        disabled={pending}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        {label}
      </Button>
      {state.error && <p className="text-xs text-destructive mt-2 max-w-56">{state.error}</p>}
    </form>
  );
}

/** Publier un profil en attente, ou retirer un profil publié. */
export function PublishButton({ profileId, validated }: { profileId: string; validated: boolean }) {
  return (
    <DecisionButton
      action={setProfileValidation}
      fields={{ profileId, validated: String(!validated) }}
      icon={validated ? Undo2 : ShieldCheck}
      label={validated ? "Retirer" : "Publier"}
      variant={validated ? "outline" : "default"}
    />
  );
}

/** Le SMS n'est pas arrivé : l'équipe a appelé la personne, et vaut confirmation. */
export function ConfirmPhoneButton({ profileId }: { profileId: string }) {
  return (
    <DecisionButton
      action={confirmPhoneByCall}
      fields={{ profileId }}
      icon={PhoneCall}
      label="Numéro confirmé par appel"
      variant="outline"
    />
  );
}

/** Un profil refusé revient dans la file. */
export function RestoreButton({ profileId }: { profileId: string }) {
  return (
    <DecisionButton
      action={restoreProfile}
      fields={{ profileId }}
      icon={RotateCcw}
      label="Remettre en attente"
      variant="outline"
    />
  );
}

/**
 * Écarter un profil avant de le publier. Le motif est facultatif ; le candidat
 * le lira sur son tableau de bord, d'où la demande de confirmation : un refus
 * ne part pas sur un seul toucher.
 */
export function RejectButton({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ProfileDecisionState, FormData>(
    rejectProfile,
    {}
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-10 rounded-full px-4 gap-2 text-destructive"
        onClick={() => setOpen(true)}
      >
        <Ban className="h-4 w-4" />
        Refuser
      </Button>
    );
  }

  return (
    <form action={action} onSubmit={submitWithoutReset(action)} className="w-full sm:w-72 space-y-2">
      <input type="hidden" name="profileId" value={profileId} />
      <label htmlFor={`motif-${profileId}`} className="block text-xs font-medium">
        Motif, facultatif — le candidat le lira
      </label>
      <Input
        id={`motif-${profileId}`}
        name="reason"
        maxLength={300}
        placeholder="Ex : pièce d'identité illisible"
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" size="sm" className="rounded-full gap-1.5" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
          Confirmer le refus
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Annuler
        </Button>
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
