"use client";

import { useActionState, useEffect } from "react";
import { Loader2, PhoneCall, ShieldCheck, Undo2, type LucideIcon } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  confirmPhoneByCall,
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
