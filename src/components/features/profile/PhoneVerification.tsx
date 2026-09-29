"use client";

import { useActionState, useState, useTransition } from "react";
import { BadgeCheck, Loader2, ShieldAlert, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendPhoneOtp, verifyPhoneOtp, type OtpState } from "@/lib/otp/actions";

type Props = {
  phone: string | null;
  verifiedAt: string | null;
  /** Faux quand les identifiants Infobip manquent : on préfère taire la
   *  fonctionnalité plutôt qu'offrir un bouton qui échouera. */
  available: boolean;
};

export function PhoneVerification({ phone, verifiedAt, available }: Props) {
  const [state, verifyAction, verifying] = useActionState<OtpState, FormData>(
    verifyPhoneOtp,
    {}
  );
  const [envoi, startEnvoi] = useTransition();
  const [envoye, setEnvoye] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState("");

  if (!available) return null;

  if (verifiedAt || state.verified) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-green-500/40 bg-green-500/10 p-4">
        <BadgeCheck className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
        <div>
          <p className="font-medium">Numéro vérifié</p>
          <p className="text-sm text-muted-foreground">
            Les employeurs peuvent vous joindre à ce numéro en toute confiance.
          </p>
        </div>
      </div>
    );
  }

  if (!phone) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted p-4">
        <Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Renseignez votre numéro ci-dessous et enregistrez, puis revenez le vérifier.
        </p>
      </div>
    );
  }

  const demander = () => {
    setErreurEnvoi("");
    startEnvoi(async () => {
      const result = await sendPhoneOtp();
      if (result.error) setErreurEnvoi(result.error);
      else setEnvoye(true);
    });
  };

  return (
    <div className="rounded-2xl border border-secondary/40 bg-secondary/10 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-secondary" />
        <div>
          <p className="font-medium">Numéro non vérifié</p>
          <p className="text-sm text-muted-foreground">
            C&apos;est par ce numéro qu&apos;un employeur vous joindra. Une seule faute de
            frappe et l&apos;appel n&apos;arrive jamais — vérifions-le.
          </p>
        </div>
      </div>

      {!envoye ? (
        <>
          <Button
            type="button"
            onClick={demander}
            disabled={envoi}
            className="rounded-full gap-2"
          >
            {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            {envoi ? "Envoi du code..." : `Recevoir un code au ${phone}`}
          </Button>
          {erreurEnvoi && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              {erreurEnvoi}
            </p>
          )}
        </>
      ) : (
        <form action={verifyAction} className="space-y-3">
          <label htmlFor="code" className="text-sm font-medium block">
            Code reçu par SMS
          </label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            required
            className="max-w-40 tracking-[0.4em] text-center font-mono text-lg"
          />

          {state.error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              {state.error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="rounded-full gap-2" disabled={verifying}>
              {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
              {verifying ? "Vérification..." : "Valider mon numéro"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={demander}
              disabled={envoi || verifying}
            >
              Renvoyer un code
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Le code expire au bout de dix minutes.
          </p>
        </form>
      )}
    </div>
  );
}
