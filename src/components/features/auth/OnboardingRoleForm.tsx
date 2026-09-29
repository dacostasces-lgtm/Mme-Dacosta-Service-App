"use client";

import { useActionState, useState } from "react";
import { Briefcase, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeOnboarding, type OnboardingState } from "@/lib/auth/onboarding";

const CHOIX = [
  {
    valeur: "employer",
    titre: "Je recrute",
    detail: "Publier une offre et contacter des candidates.",
    Icone: Briefcase,
  },
  {
    valeur: "candidate",
    titre: "Je cherche un emploi",
    detail: "Créer mon profil et postuler aux offres.",
    Icone: Search,
  },
] as const;

/**
 * Deux cartes plutôt qu'un menu déroulant : c'est la seule question de l'écran,
 * elle n'est posée qu'une fois et elle décide de tout le reste. Un `select`
 * l'aurait rendue aussi discrète qu'un champ parmi d'autres.
 */
export function OnboardingRoleForm() {
  const [role, setRole] = useState<"employer" | "candidate" | null>(null);
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="role" value={role ?? ""} />

      <fieldset disabled={pending} className="space-y-3">
        <legend className="sr-only">Que venez-vous faire sur Madame Dacosta ?</legend>

        {CHOIX.map(({ valeur, titre, detail, Icone }) => (
          <label
            key={valeur}
            className={`flex items-start gap-4 p-4 border rounded-2xl cursor-pointer transition-all ${
              role === valeur
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40"
            }`}
          >
            <input
              type="radio"
              name="choix"
              value={valeur}
              className="sr-only"
              checked={role === valeur}
              onChange={() => setRole(valeur)}
            />
            <span
              className={`h-10 w-10 rounded-full grid place-items-center shrink-0 ${
                role === valeur ? "bg-primary text-primary-foreground" : "bg-accent text-primary"
              }`}
            >
              <Icone className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="font-semibold block">{titre}</span>
              <span className="text-sm text-muted-foreground">{detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{state.error}</p>
      )}

      <Button
        type="submit"
        className="w-full h-12 text-base font-semibold rounded-full"
        disabled={pending || !role}
      >
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {pending ? "Enregistrement..." : "Continuer"}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Ce choix ne se change pas ensuite : vos offres et vos candidatures y sont
        rattachées. Écrivez-nous si vous vous êtes trompé.
      </p>
    </form>
  );
}
