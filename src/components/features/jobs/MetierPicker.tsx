"use client";

import { useState } from "react";
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
        name={name}
        value={value}
        required={required}
        onChange={() => {}}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onInvalid={(event) =>
          (event.target as HTMLInputElement).setCustomValidity("Choisissez un métier.")
        }
        onInput={(event) => (event.target as HTMLInputElement).setCustomValidity("")}
      />
    </fieldset>
  );
}
