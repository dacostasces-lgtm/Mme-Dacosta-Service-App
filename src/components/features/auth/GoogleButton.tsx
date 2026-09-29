"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Le drapeau vient de l'environnement et non d'une interrogation de Supabase :
 * le navigateur ne peut pas savoir quels fournisseurs sont activés côté
 * serveur, et un bouton qui répond « Unsupported provider » est pire que pas de
 * bouton. Il reste donc caché tant que Google n'est pas réellement branché.
 */
export function isGoogleAuthEnabled() {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1";
}

/** Le logo officiel, en SVG : un PNG distant demanderait d'ouvrir la CSP. */
function LogoGoogle() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * Renvoie vers /auth/confirm, qui échange déjà le `code` PKCE des liens de
 * confirmation : le retour de Google emprunte le même chemin, et arrive donc
 * sur le tableau de bord du bon rôle sans route supplémentaire.
 *
 * Google ne transmet aucun rôle. Le compte créé porte celui par défaut, que
 * personne n'a choisi — c'est /bienvenue, imposée par requireUser, qui pose la
 * question avant de laisser entrer.
 */
export function GoogleButton({ libelle }: { libelle: string }) {
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!isGoogleAuthEnabled()) return null;

  const onClick = async () => {
    setError("");
    setPending(true);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/confirm?locale=${locale}` },
    });

    // Pas de remise à false en cas de succès : la page part vers Google, et
    // rendre le bouton de nouveau cliquable ne ferait qu'inviter un second clic
    // pendant la redirection.
    if (oauthError) {
      setError(`Connexion Google impossible : ${oauthError.message}`);
      setPending(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        className="w-full h-12 gap-3 text-base font-medium rounded-full"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogoGoogle />}
        {libelle}
      </Button>

      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </div>
  );
}
