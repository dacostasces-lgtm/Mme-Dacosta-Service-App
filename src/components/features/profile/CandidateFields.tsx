"use client";

import { useState } from "react";
import { EXPERIENCE_OPTIONS } from "@/lib/profile/completeness";
import { availabilityLabel, RHYTHM_OPTIONS } from "@/lib/candidates/availability";
import { MetierPicker } from "@/components/features/jobs/MetierPicker";
import { SkillsPicker } from "@/components/features/profile/SkillsPicker";
import { ScheduleFields } from "@/components/features/jobs/ScheduleFields";
import { Input } from "@/components/ui/input";
import {
  CHILDREN_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  YOUNGEST_CHILD_AGE_OPTIONS,
} from "@/lib/candidates/family";

/**
 * Les cases du métier d'un candidat, partagées par le profil (ProfileForm) et
 * par l'inscription (RegisterForm). Mêmes noms de champs des deux côtés : le
 * serveur les lit avec `readCandidateFields` (src/lib/profile/candidate-form.ts).
 */

export const FIELD =
  "w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
export const SELECT =
  "w-full h-12 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

export type CandidateProfile = {
  jobTitle: string | null;
  age: number | null;
  gender: string | null;
  experience: string | null;
  desiredSalary: number | null;
  availability: string | null;
  description: string | null;
  languages: string[];
  skills: string[];
  workDays: string[];
  startTime: string | null;
  endTime: string | null;
  liveIn: boolean;
  maritalStatus: string | null;
  childrenCount: number | null;
  youngestChildAge: number | null;
};

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium mb-1 block">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export function CandidateFields({
  candidate,
  required,
  familyEditable,
  onJobTitleChange,
}: {
  candidate?: CandidateProfile;
  /** Obligatoires pour un candidat ; l'admin, qui passe par le même
   *  formulaire, n'y est pas soumis. */
  required: boolean;
  /** Faux tant que la situation familiale n'est pas lisible en base. */
  familyEditable: boolean;
  /** Le métier choisi : un chauffeur doit aussi fournir son permis. */
  onJobTitleChange?: (value: string) => void;
}) {
  return (
    <>
    <div>
      <MetierPicker
        name="jobTitle"
        legend="Poste recherché"
        required={required}
        defaultValue={candidate?.jobTitle}
          onValueChange={onJobTitleChange}
        otherPlaceholder="Écrivez le poste que vous recherchez"
      />
      <p className="text-xs text-muted-foreground mt-2">
        Touchez votre métier. C&apos;est le titre affiché en gros sur votre fiche.
      </p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Années d'expérience" htmlFor="experience">
        <select
          id="experience"
          name="experience"
          required={required}
          defaultValue={candidate?.experience ?? ""}
          className={SELECT}
        >
          <option value="">Choisir</option>
          {EXPERIENCE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          {/* Une valeur écrite à la main avant cette liste reste choisie. */}
          {candidate?.experience && !EXPERIENCE_OPTIONS.includes(candidate.experience) && (
            <option value={candidate.experience}>{candidate.experience}</option>
          )}
        </select>
      </Field>
      <Field label="Âge" htmlFor="age">
        <Input
          id="age"
          name="age"
          type="number"
          min="16"
          max="80"
          required={required}
          defaultValue={candidate?.age ?? ""}
        />
      </Field>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Disponibilité" htmlFor="availability">
        <select
          id="availability"
          name="availability"
          required={required}
          defaultValue={candidate?.availability ?? ""}
          className={SELECT}
        >
          <option value="">Non précisée</option>
          {RHYTHM_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {/* Une ancienne valeur reste sélectionnée plutôt que
              d'être effacée en silence au prochain enregistrement. */}
          {(candidate?.availability === "internal" ||
            candidate?.availability === "external") && (
            <option value={candidate.availability}>
              {availabilityLabel(candidate.availability)}
            </option>
          )}
        </select>
      </Field>
      <Field label="Sexe" htmlFor="gender">
        <select
          id="gender"
          name="gender"
          required={required}
          defaultValue={candidate?.gender ?? ""}
          className={SELECT}
        >
          <option value="">Non précisé</option>
          <option value="F">Femme</option>
          <option value="M">Homme</option>
        </select>
      </Field>
    </div>

    {familyEditable && (
      <FamilySituation
        required={required}
        maritalStatus={candidate?.maritalStatus ?? null}
        childrenCount={candidate?.childrenCount ?? null}
        youngestChildAge={candidate?.youngestChildAge ?? null}
      />
    )}

    <div className="space-y-5 rounded-2xl border border-border p-4">
      <div>
        <h3 className="font-medium">Jours et horaires de disponibilité</h3>
        <p className="text-xs text-muted-foreground">
          Les employeurs filtrent les candidats sur ces critères. Cochez au moins un jour
          et indiquez vos heures.
        </p>
      </div>
      <ScheduleFields
        daysLegend="Jours où vous êtes disponible"
        liveInHint="Vous acceptez d'être logé(e) et de passer la nuit chez l'employeur."
        defaults={candidate}
        required={required}
      />
    </div>

    <Field
      label="Salaire souhaité"
      htmlFor="desiredSalary"
      hint="En FCFA, par mois."
    >
      <Input
        id="desiredSalary"
        name="desiredSalary"
        type="number"
        min="0"
        step="1000"
        required={required}
        defaultValue={candidate?.desiredSalary ?? ""}
        placeholder="80000"
      />
    </Field>

    <SkillsPicker
      name="skills"
      legend="Compétences"
      defaultValue={candidate?.skills ?? []}
      required={required}
    />

    <Field
      label="Langues parlées"
      htmlFor="languages"
      hint="Séparées par des virgules. Ex : français, lingala, kituba"
    >
      <Input
        id="languages"
        name="languages"
        required={required}
        defaultValue={candidate?.languages.join(", ") ?? ""}
        placeholder="français, lingala"
      />
    </Field>
    </>
  );
}

/**
 * Situation matrimoniale et enfants : trois listes à toucher. L'âge du dernier
 * enfant n'apparaît qu'avec au moins un enfant — sans quoi la question n'a pas
 * de sens, et une case obligatoire vide bloquerait l'enregistrement.
 */
function FamilySituation({
  required,
  maritalStatus,
  childrenCount,
  youngestChildAge,
}: {
  required: boolean;
  maritalStatus: string | null;
  childrenCount: number | null;
  youngestChildAge: number | null;
}) {
  const [children, setChildren] = useState<string>(
    childrenCount === null ? "" : String(childrenCount)
  );
  const hasChildren = children !== "" && Number(children) > 0;

  return (
    <div className="space-y-4 rounded-2xl border border-border p-4">
      <div>
        <h3 className="font-medium">Situation familiale</h3>
        <p className="text-xs text-muted-foreground">
          Les familles le demandent souvent pour garder des enfants ou tenir une maison. Visible
          seulement des employeurs inscrits et de notre équipe, jamais du public.
        </p>
      </div>

      <Field label="Situation matrimoniale" htmlFor="maritalStatus">
        <select
          id="maritalStatus"
          name="maritalStatus"
          required={required}
          defaultValue={maritalStatus ?? ""}
          className={SELECT}
        >
          <option value="">Choisir</option>
          {MARITAL_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre d'enfants" htmlFor="childrenCount">
          <select
            id="childrenCount"
            name="childrenCount"
            required={required}
            value={children}
            onChange={(event) => setChildren(event.target.value)}
            className={SELECT}
          >
            <option value="">Choisir</option>
            {CHILDREN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        {hasChildren && (
          <Field label="Âge du dernier enfant" htmlFor="youngestChildAge">
            <select
              id="youngestChildAge"
              name="youngestChildAge"
              required={required}
              defaultValue={youngestChildAge ?? ""}
              className={SELECT}
            >
              <option value="">Choisir</option>
              {YOUNGEST_CHILD_AGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </div>
  );
}
