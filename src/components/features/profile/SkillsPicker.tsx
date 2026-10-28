"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { knownSkill, SKILL_GROUPS, SKILLS } from "@/lib/candidates/skills";

/**
 * Choix des compétences par boutons, plusieurs à la fois, avec « Autre
 * compétence » pour quelques mots hors de la liste.
 *
 * Même principe que MetierPicker : la valeur part dans un champ caché nommé
 * `name`, en une chaîne séparée par des virgules — les actions la lisent comme
 * l'ancienne case. Une compétence déjà enregistrée hors de la liste revient
 * dans « Autre compétence », pour être gardée, raccourcie ou effacée.
 */
export function SkillsPicker({
  name,
  legend,
  hint = "Touchez tout ce que vous savez faire.",
  defaultValue = [],
  required = false,
}: {
  name: string;
  legend: string;
  hint?: string;
  defaultValue?: readonly string[];
  required?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    defaultValue.map(knownSkill).filter((skill): skill is string => skill !== null)
  );
  const initialOther = defaultValue.filter((skill) => knownSkill(skill) === null).join(", ");
  const [otherOpen, setOtherOpen] = useState(initialOther !== "");
  const [other, setOther] = useState(initialOther);

  const toggle = (skill: string) =>
    setSelected((current) =>
      current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]
    );

  // Dans l'ordre de la liste, puis ce qui a été écrit.
  const value = [
    ...SKILLS.filter((skill) => selected.includes(skill)),
    ...(otherOpen ? [other.trim()] : []),
  ]
    .filter(Boolean)
    .join(", ");

  // La validité suit la valeur. `onInput` ne part jamais sur ce champ, que
  // React remplit lui-même : un message posé au premier envoi raté restait
  // collé, et le formulaire refusait de partir même une fois la case remplie.
  const hidden = useRef<HTMLInputElement>(null);
  useEffect(() => {
    hidden.current?.setCustomValidity(
      required && value === "" ? "Choisissez au moins une compétence." : ""
    );
  }, [required, value]);

  const chip = (pressed: boolean) =>
    `rounded-full border px-4 py-2 text-sm transition-colors ${
      pressed ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
    }`;

  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="text-xs text-muted-foreground mb-3">{hint}</p>

      <div className="space-y-3">
        {SKILL_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">{group.label}</p>
            <div className="flex flex-wrap gap-2">
              {group.skills.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggle(skill)}
                  aria-pressed={selected.includes(skill)}
                  className={chip(selected.includes(skill))}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div>
          <button
            type="button"
            onClick={() => setOtherOpen((open) => !open)}
            aria-pressed={otherOpen}
            className={chip(otherOpen)}
          >
            Autre compétence…
          </button>
          {otherOpen && (
            <>
              <Input
                className="mt-3"
                value={other}
                onChange={(event) => setOther(event.target.value)}
                placeholder="Ex : couture, coiffure"
                maxLength={200}
                aria-label="Autre compétence"
                autoFocus={initialOther === ""}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Quelques mots pour chacune, séparées par des virgules.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Même raison que dans MetierPicker : un champ caché n'est pas validé
          par le navigateur, un champ texte invisible l'est. */}
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
