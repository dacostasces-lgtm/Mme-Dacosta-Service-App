"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { METIERS } from "@/lib/jobs/metiers";

const AUTRE = "__autre__";

/**
 * Choix du métier par boutons, avec « Autre » pour écrire un intitulé.
 *
 * La valeur part dans un champ caché nommé `name` : les actions la lisent
 * comme avant, sans savoir si elle a été touchée ou tapée.
 */
export function MetierPicker({
  name,
  legend,
  defaultValue,
  required = false,
  otherPlaceholder = "Écrivez le métier",
}: {
  name: string;
  legend: string;
  defaultValue?: string | null;
  required?: boolean;
  otherPlaceholder?: string;
}) {
  const initial = defaultValue?.trim() ?? "";
  const known = (METIERS as readonly string[]).includes(initial);
  const [choice, setChoice] = useState<string>(known ? initial : initial ? AUTRE : "");
  const [other, setOther] = useState(known ? "" : initial);

  const value = choice === AUTRE ? other.trim() : choice;

  // La validité suit la valeur. `onInput` ne part jamais sur ce champ, que
  // React remplit lui-même : le message posé par un premier envoi sans métier
  // restait collé, et le formulaire refusait de partir même une fois le
  // métier choisi, jusqu'à recharger la page.
  const hidden = useRef<HTMLInputElement>(null);
  useEffect(() => {
    hidden.current?.setCustomValidity(required && value === "" ? "Choisissez un métier." : "");
  }, [required, value]);

  return (
    <fieldset>
      <legend className="text-sm font-medium mb-2">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {[...METIERS, AUTRE].map((metier) => (
          <button
            key={metier}
            type="button"
            onClick={() => setChoice(metier)}
            aria-pressed={choice === metier}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              choice === metier
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent"
            }`}
          >
            {metier === AUTRE ? "Autre…" : metier}
          </button>
        ))}
      </div>

      {choice === AUTRE && (
        <Input
          className="mt-3"
          value={other}
          onChange={(event) => setOther(event.target.value)}
          placeholder={otherPlaceholder}
          maxLength={80}
          aria-label="Autre métier"
          autoFocus
        />
      )}

      {/* `required` porté par le champ caché ne bloquerait rien : un champ
          caché n'est pas validé par le navigateur. Un champ texte invisible
          mais présent l'est, et son message s'affiche sur les boutons. */}
      <input
        ref={hidden}
        name={name}
        value={value}
        required={required}
        onChange={() => {}}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      />
    </fieldset>
  );
}
