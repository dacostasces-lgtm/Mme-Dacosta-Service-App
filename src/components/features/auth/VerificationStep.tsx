"use client";

import { useActionState, useState, useTransition } from "react";
import { BadgeCheck, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/routing";
import { PHONE_HINT } from "@/lib/phone";
import {
  sendPhoneOtp,
  skipPhoneVerification,
  verifyPhoneOtp,
  type OtpState,
} from "@/lib/otp/actions";
import { updatePhoneOnly } from "@/lib/otp/phone-action";

type Props = { phone: string | null; dashboardPath: string };

export function VerificationStep({ phone, dashboardPath }: Props) {
  const router = useRouter();
  const [state, verifyAction, verifying] = useActionState<OtpState, FormData>(
    verifyPhoneOtp,
    {}
  );
  const [numero, setNumero] = useState(phone ?? "");
  const [enCours, start] = useTransition();
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState("");
  const [bloque, setBloque] = useState(false);

  if (state.verified) {
    return (
      <div className="text-center">
        <BadgeCheck className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
        <p className="font-semibold text-lg mb-2">Numéro vérifié</p>
        <p className="text-sm text-muted-foreground mb-6">
          Votre compte est prêt. Les employeurs peuvent vous joindre en toute confiance.
        </p>
        <Button
          className="w-full h-12 rounded-full text-base font-semibold"
          onClick={() => {
            router.push(dashboardPath);
            router.refresh();
          }}
        >
          Accéder à mon espace
        </Button>
      </div>
    );
  }

  const demander = () => {
    setErreur("");
    start(async () => {
      // Le numéro saisi ici est d'abord enregistré : l'envoi se fait toujours
      // vers celui du profil, jamais vers une valeur venue du formulaire.
      if (numero.trim() && numero.trim() !== (phone ?? "")) {
        const maj = await updatePhoneOnly(numero);
        if (maj.error) {
          setErreur(maj.error);
          return;
        }
      }
      const result = await sendPhoneOtp();
      if (result.error) {
        setErreur(result.error);
        // Un échec d'envoi ne doit pas séquestrer le compte : le SMS n'arrive
        // pas toujours, et l'utilisatrice n'y peut rien.
        setBloque(true);
        return;
      }
      setEnvoye(true);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {!envoye ? (
        <>
          <div>
            <label htmlFor="numero" className="text-sm font-medium mb-1 block">
              Votre numéro
            </label>
            <Input
              id="numero"
              type="tel"
              inputMode="tel"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="06 717 30 30"
            />
            <p className="text-xs text-muted-foreground mt-1">{PHONE_HINT}</p>
          </div>

          {erreur && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{erreur}</p>
          )}

          <Button
            onClick={demander}
            disabled={enCours || !numero.trim()}
            className="w-full h-12 rounded-full text-base font-semibold gap-2"
          >
            {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            {enCours ? "Envoi du code..." : "Recevoir mon code par SMS"}
          </Button>
        </>
      ) : (
        <form action={verifyAction} className="space-y-4">
          <div>
            <label htmlFor="code" className="text-sm font-medium mb-1 block">
              Code reçu au {numero}
            </label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              required
              autoFocus
              className="tracking-[0.4em] text-center font-mono text-xl h-14"
            />
          </div>

          {state.error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              {state.error}
            </p>
          )}

          <Button
            type="submit"
            disabled={verifying}
            className="w-full h-12 rounded-full text-base font-semibold gap-2"
          >
            {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
            {verifying ? "Vérification..." : "Valider"}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={demander}
              disabled={enCours || verifying}
              className="text-primary font-medium hover:underline disabled:opacity-50"
            >
              Renvoyer un code
            </button>
            <button
              type="button"
              onClick={() => setEnvoye(false)}
              className="text-muted-foreground hover:underline"
            >
              Changer de numéro
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Le code expire au bout de dix minutes.</p>
        </form>
      )}

      {/* Porte de secours, révélée seulement après un échec d'envoi. Sans elle,
          un SMS qui n'arrive pas enferme définitivement quelqu'un hors de son
          propre compte — le profil reste non vérifié, ce que la modération
          voit, et c'est là que la contrainte doit peser. */}
      {bloque && (
        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground mb-2">
            Le code n&apos;arrive pas ? Vous pourrez réessayer depuis votre profil.
          </p>
          <Button
            variant="ghost"
            className="rounded-full text-muted-foreground"
            disabled={enCours}
            onClick={() =>
              start(async () => {
                // Le report est posé côté serveur avant de partir : sans lui,
                // la porte de requireUser renverrait aussitôt ici.
                await skipPhoneVerification();
                router.push(dashboardPath);
                router.refresh();
              })
            }
          >
            Continuer sans vérifier
          </Button>
        </div>
      )}
    </div>
  );
}
