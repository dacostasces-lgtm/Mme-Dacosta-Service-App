"use client";

import { useActionState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/routing";
import { PHONE_HINT } from "@/lib/phone";
import {
  resetPasswordByPhone,
  startPhoneRecovery,
  verifyPhoneRecovery,
  type RecoveryState,
} from "@/lib/otp/recovery";

/**
 * Trois étapes : numéro, code reçu, nouveau mot de passe.
 *
 * Chacune est un formulaire distinct piloté par son action serveur. L'état qui
 * autorise réellement le changement ne vit pas ici mais en base — ce composant
 * ne fait qu'avancer dans l'écran.
 */
export function PhoneRecoveryForm() {
  const [envoi, envoyer, envoiEnCours] = useActionState<RecoveryState, FormData>(
    startPhoneRecovery,
    {}
  );
  const [verif, verifier, verifEnCours] = useActionState<RecoveryState, FormData>(
    verifyPhoneRecovery,
    {}
  );
  const [reset, reinitialiser, resetEnCours] = useActionState<RecoveryState, FormData>(
    resetPasswordByPhone,
    {}
  );

  if (reset.done) {
    return (
      <div className="text-center">
        <BadgeCheck className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
        <p className="font-semibold text-lg mb-2">Mot de passe modifié</p>
        <p className="text-sm text-muted-foreground mb-6">
          Vous pouvez maintenant vous connecter avec votre numéro et ce nouveau mot de passe.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center h-12 px-6 rounded-full bg-primary text-primary-foreground font-semibold"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  if (verif.verified) {
    return (
      <form action={reinitialiser} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Numéro confirmé. Choisissez un nouveau mot de passe.
        </p>
        <div>
          <label htmlFor="password" className="text-sm font-medium mb-1 block">
            Nouveau mot de passe
          </label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </div>
        <div>
          <label htmlFor="confirm" className="text-sm font-medium mb-1 block">
            Confirmez
          </label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        {reset.error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{reset.error}</p>
        )}
        <Button type="submit" disabled={resetEnCours} className="w-full h-12 rounded-full font-semibold gap-2">
          {resetEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer le mot de passe
        </Button>
      </form>
    );
  }

  if (envoi.sent) {
    return (
      <form action={verifier} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Si un compte existe avec ce numéro, un code à six chiffres vient d&apos;y être
          envoyé.
        </p>
        <div>
          <label htmlFor="code" className="text-sm font-medium mb-1 block">
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
            className="tracking-[0.4em] text-center font-mono text-xl h-14"
          />
        </div>
        {verif.error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{verif.error}</p>
        )}
        <Button type="submit" disabled={verifEnCours} className="w-full h-12 rounded-full font-semibold gap-2">
          {verifEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
          Valider le code
        </Button>
      </form>
    );
  }

  return (
    <form action={envoyer} className="space-y-4">
      <div>
        <label htmlFor="phone" className="text-sm font-medium mb-1 block">
          Votre numéro
        </label>
        <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="06 717 30 30" required />
        <p className="text-xs text-muted-foreground mt-1">{PHONE_HINT}</p>
      </div>
      {envoi.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{envoi.error}</p>
      )}
      <Button type="submit" disabled={envoiEnCours} className="w-full h-12 rounded-full font-semibold gap-2">
        {envoiEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
        Recevoir un code par SMS
      </Button>
    </form>
  );
}
