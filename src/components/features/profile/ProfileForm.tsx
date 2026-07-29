"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfile, type ProfileFormState } from "@/lib/profile/actions";
import { PHONE_HINT } from "@/lib/phone";
import type { NeighborhoodOption } from "@/components/features/jobs/JobForm";

const FIELD =
  "w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
const SELECT =
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
};

export type EmployerProfile = {
  companyName: string | null;
  address: string | null;
  description: string | null;
};

type Props = {
  role: "candidate" | "employer" | "admin";
  fullName: string;
  phone: string | null;
  whatsapp: string | null;
  /** False when my_contact() is unavailable — the inputs are then hidden
   *  rather than shown empty, which would wipe the stored numbers on save. */
  contactEditable: boolean;
  neighborhoodId: string | null;
  neighborhoods: NeighborhoodOption[];
  candidate?: CandidateProfile;
  employer?: EmployerProfile;
};

function Field({
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

export function ProfileForm({
  role,
  fullName,
  phone,
  whatsapp,
  contactEditable,
  neighborhoodId,
  neighborhoods,
  candidate,
  employer,
}: Props) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    updateProfile,
    {}
  );
  const isEmployer = role === "employer";

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-5">
        <h2 className="font-semibold text-lg">Identité</h2>

        <Field label="Nom complet" htmlFor="fullName">
          <Input id="fullName" name="fullName" defaultValue={fullName} required />
        </Field>

        {contactEditable ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Téléphone" htmlFor="phone" hint={PHONE_HINT}>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                defaultValue={phone ?? ""}
                placeholder="06 717 30 30"
              />
            </Field>
            <Field label="WhatsApp" htmlFor="whatsapp" hint="Laissez vide si c'est le même numéro.">
              <Input
                id="whatsapp"
                name="whatsapp"
                type="tel"
                inputMode="tel"
                defaultValue={whatsapp ?? ""}
                placeholder="06 717 30 30"
              />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3">
            Les numéros de contact ne sont pas modifiables ici pour le moment : la migration
            <code className="mx-1 text-xs">20260728010000_restrict_profile_pii</code>
            n&apos;a pas encore été appliquée à la base. Vos numéros enregistrés sont conservés.
          </p>
        )}

        <Field
          label="Quartier"
          htmlFor="neighborhoodId"
          hint={
            neighborhoods.length === 0
              ? "Aucun quartier enregistré pour l'instant."
              : "C'est ce qui permet aux employeurs de vous trouver par proximité."
          }
        >
          <select
            id="neighborhoodId"
            name="neighborhoodId"
            defaultValue={neighborhoodId ?? ""}
            className={SELECT}
          >
            <option value="">Non précisé</option>
            {neighborhoods.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {isEmployer ? (
        <section className="space-y-5">
          <h2 className="font-semibold text-lg">Votre foyer ou société</h2>

          <Field
            label="Nom du foyer ou de la société"
            htmlFor="companyName"
            hint="Facultatif. Ex : Famille Dacosta, ou le nom de votre entreprise."
          >
            <Input
              id="companyName"
              name="companyName"
              defaultValue={employer?.companyName ?? ""}
            />
          </Field>

          <Field label="Adresse" htmlFor="address" hint="Visible uniquement par vous.">
            <Input id="address" name="address" defaultValue={employer?.address ?? ""} />
          </Field>

          <Field label="Présentation" htmlFor="description">
            <textarea
              id="description"
              name="description"
              rows={5}
              defaultValue={employer?.description ?? ""}
              placeholder="Composition du foyer, attentes, environnement de travail..."
              className={FIELD}
            />
          </Field>
        </section>
      ) : (
        <section className="space-y-5">
          <h2 className="font-semibold text-lg">Votre métier</h2>

          <Field
            label="Poste recherché"
            htmlFor="jobTitle"
            hint="C'est le titre affiché en gros sur votre fiche."
          >
            <Input
              id="jobTitle"
              name="jobTitle"
              defaultValue={candidate?.jobTitle ?? ""}
              placeholder="Nounou, Ménagère, Cuisinière, Chauffeur..."
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Années d'expérience" htmlFor="experience">
              <Input
                id="experience"
                name="experience"
                defaultValue={candidate?.experience ?? ""}
                placeholder="5 ans"
              />
            </Field>
            <Field label="Âge" htmlFor="age">
              <Input
                id="age"
                name="age"
                type="number"
                min="16"
                max="80"
                defaultValue={candidate?.age ?? ""}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Disponibilité" htmlFor="availability">
              <select
                id="availability"
                name="availability"
                defaultValue={candidate?.availability ?? ""}
                className={SELECT}
              >
                <option value="">Non précisée</option>
                <option value="full_time">Temps plein</option>
                <option value="part_time">Temps partiel</option>
                <option value="internal">Logée sur place</option>
                <option value="external">Non logée</option>
              </select>
            </Field>
            <Field label="Sexe" htmlFor="gender">
              <select
                id="gender"
                name="gender"
                defaultValue={candidate?.gender ?? ""}
                className={SELECT}
              >
                <option value="">Non précisé</option>
                <option value="F">Femme</option>
                <option value="M">Homme</option>
              </select>
            </Field>
          </div>

          <Field
            label="Salaire souhaité"
            htmlFor="desiredSalary"
            hint="En FCFA, par mois. Facultatif."
          >
            <Input
              id="desiredSalary"
              name="desiredSalary"
              type="number"
              min="0"
              step="1000"
              defaultValue={candidate?.desiredSalary ?? ""}
              placeholder="80000"
            />
          </Field>

          <Field
            label="Compétences"
            htmlFor="skills"
            hint="Séparées par des virgules. Ex : cuisine, repassage, garde d'enfants"
          >
            <Input
              id="skills"
              name="skills"
              defaultValue={candidate?.skills.join(", ") ?? ""}
              placeholder="cuisine, repassage, garde d'enfants"
            />
          </Field>

          <Field
            label="Langues parlées"
            htmlFor="languages"
            hint="Séparées par des virgules. Ex : français, lingala, kituba"
          >
            <Input
              id="languages"
              name="languages"
              defaultValue={candidate?.languages.join(", ") ?? ""}
              placeholder="français, lingala"
            />
          </Field>

          <Field
            label="Présentation"
            htmlFor="description"
            hint="Quelques lignes sur votre parcours. C'est souvent ce qui décide un employeur."
          >
            <textarea
              id="description"
              name="description"
              rows={6}
              defaultValue={candidate?.description ?? ""}
              placeholder="Votre expérience, ce que vous savez faire, ce que vous recherchez..."
              className={FIELD}
            />
          </Field>
        </section>
      )}

      {state.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{state.error}</p>
      )}

      {state.ok && !pending && (
        <p className="text-sm text-green-700 dark:text-green-400 bg-green-500/10 rounded-lg p-3 flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" />
          Profil enregistré.
        </p>
      )}

      <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {pending ? "Enregistrement..." : "Enregistrer mon profil"}
      </Button>
    </form>
  );
}
