"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  etatDuPaiement,
  payerParMobileMoney,
  type Achat,
  type PaiementState,
} from "@/lib/payments/actions";

/** Trois secondes : l'acheteur a le téléphone en main, et chaque tour est un
 *  appel sortant chez PawaPay. */
const INTERVALLE_MS = 3_000;
/** Deux minutes, au-delà desquelles une demande d'autorisation a expiré chez
 *  l'opérateur. On cesse d'interroger et on invite à réessayer. */
const PATIENCE_MS = 120_000;

/**
 * Paiement Mobile Money sans transfert manuel.
 *
 * L'acheteur saisit le numéro qui paie, reçoit une demande d'autorisation sur
 * son téléphone, tape son code. La page interroge l'état pendant ce temps —
 * un rappel de PawaPay fait le même travail de son côté, et les deux chemins
 * mènent à la même fonction, rejouable.
 *
 * Il n'y a plus d'opérateur à choisir : PawaPay le reconnaît au numéro. C'est
 * aussi ce qui règle l'absence de numéro marchand Airtel, qui laissait la
 * moitié des acheteurs devant une seule ligne MTN.
 */
export function MobileMoneyPayment({
  achat,
  targetId,
  amountLabel,
}: {
  achat: Achat;
  targetId: string;
  amountLabel: string;
}) {
  const action = payerParMobileMoney.bind(null, achat, targetId);
  const [state, formAction, pending] = useActionState<PaiementState, FormData>(action, {});
  const [suivi, setSuivi] = useState<PaiementState | null>(null);
  // Mémorisé par versement, et non par un booléen : un nouvel essai porte un
  // autre identifiant, donc l'avertissement d'expiration disparaît de lui-même
  // sans qu'on ait à le remettre à zéro depuis l'effet — ce qui déclencherait
  // un rendu en cascade.
  const [expirePour, setExpirePour] = useState<string | null>(null);
  const router = useRouter();

  const expire = Boolean(state.depositId) && expirePour === state.depositId;
  const etat = suivi?.status ?? state.status;
  const erreur = suivi?.error ?? state.error;
  const enCours = etat === "ACCEPTED" || etat === "PROCESSING" || etat === "IN_RECONCILIATION";

  // Garde la dernière valeur sans relancer l'effet à chaque tour.
  const depositId = state.depositId;
  const arrete = useRef(false);

  useEffect(() => {
    if (!depositId) return;
    arrete.current = false;
    const debut = Date.now();

    const tour = async () => {
      if (arrete.current) return;
      const lu = await etatDuPaiement(depositId);
      if (arrete.current) return;
      setSuivi(lu);

      if (lu.status === "COMPLETED") {
        arrete.current = true;
        // Depuis ici, pas depuis l'action : un rafraîchissement déclenché côté
        // serveur retient la réponse, et l'écran reste figé sur l'attente.
        router.refresh();
        return;
      }
      if (lu.status === "FAILED") {
        arrete.current = true;
        return;
      }
      if (Date.now() - debut > PATIENCE_MS) {
        arrete.current = true;
        setExpirePour(depositId);
        return;
      }
      timer = setTimeout(tour, INTERVALLE_MS);
    };

    let timer = setTimeout(tour, INTERVALLE_MS);
    return () => {
      arrete.current = true;
      clearTimeout(timer);
    };
  }, [depositId, router]);

  if (etat === "COMPLETED") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-green-600/30 bg-green-600/5 p-5">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Paiement reçu</p>
          <p className="text-sm text-muted-foreground">
            C&apos;est réglé, tout de suite. Vous n&apos;avez rien d&apos;autre à faire.
          </p>
        </div>
      </div>
    );
  }

  if (enCours && !expire) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
        <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Regardez votre téléphone</p>
          <p className="text-sm text-muted-foreground">
            Une demande d&apos;autorisation de {amountLabel} vous a été envoyée. Tapez votre code
            Mobile Money pour confirmer — cet écran se met à jour tout seul.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor={`payeur-${targetId}`} className="text-sm font-medium mb-1.5 block">
          Numéro Mobile Money qui paie
        </label>
        <Input
          id={`payeur-${targetId}`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="06 717 30 30"
          required
          className="h-12"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          MTN ou Airtel, peu importe : votre opérateur est reconnu au numéro.
        </p>
      </div>

      {expire && (
        <p className="text-sm text-amber-700 dark:text-amber-500 bg-amber-500/10 rounded-lg p-3">
          La demande a expiré sans réponse. Relancez-la, puis validez sur votre téléphone.
        </p>
      )}
      {erreur && !expire && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{erreur}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full h-12 rounded-full gap-2 text-base">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Smartphone className="h-4 w-4" aria-hidden />
        )}
        {pending ? "Envoi de la demande…" : `Payer ${amountLabel}`}
      </Button>
    </form>
  );
}
