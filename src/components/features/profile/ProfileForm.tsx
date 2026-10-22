"use client";

import { EXPERIENCE_OPTIONS } from "@/lib/profile/completeness";
import { availabilityLabel, RHYTHM_OPTIONS } from "@/lib/candidates/availability";
import { MetierPicker } from "@/components/features/jobs/MetierPicker";
import {
  CHILDREN_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  YOUNGEST_CHILD_AGE_OPTIONS,
} from "@/lib/candidates/family";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfile, type ProfileFormState } from "@/lib/profile/actions";
import { PHONE_HINT } from "@/lib/phone";
import type { NeighborhoodOption } from "@/components/features/jobs/JobForm";
import { ScheduleFields } from "@/components/features/jobs/ScheduleFields";

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
  workDays: string[];
  startTime: string | null;
  endTime: string | null;
  liveIn: boolean;
  maritalStatus: string | null;
  childrenCount: number | null;
  youngestChildAge: number | null;
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
  /** Adresse précise du candidat, privée (20261012000000_candidate_address.sql). */
  candidateAddress?: string | null;
  /** False tant que la table des adresses n'est pas lisible : le champ est
   *  alors masqué plutôt qu'exigé sans pouvoir être enregistré. */
  addressEditable?: boolean;
  /** Même règle pour la situation familiale (20261022000000). */
  familyEditable?: boolean;
  employer?: EmployerProfile;
  /** Cases encore vides du profil candidat, affichées en tête du formulaire. */
  missing?: string[];
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
  candidateAddress = null,
  addressEditable = false,
  familyEditable = false,
  employer,
  missing = [],
}: Props) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    updateProfile,
    {}
  );
  const router = useRouter();

  // L'action ne revalide rien (elle bloquerait sa propre réponse) : la page se
  // rafraîchit ici, pour le nom dans la barre de navigation et les bandeaux de
  // cases manquantes.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  const isEmployer = role === "employer";
  // Les cases obligatoires ne le sont que pour un candidat ; l'admin, qui
  // passe par ce même formulaire, n'y est pas soumis.
  const candidateRequired = role === "candidate";

  return (
    <form action={formAction} className="space-y-8">
      {isEmployer && missing.length > 0 && (
        <div className="rounded-2xl border-2 border-secondary bg-secondary/10 p-4 text-sm">
          <p className="font-semibold mb-1">Ajoutez votre numéro de téléphone</p>
          <p className="text-muted-foreground">
            Il est obligatoire pour publier une offre : c&apos;est par lui que les candidats et
            notre équipe vous joignent.
          </p>
        </div>
      )}
      {candidateRequired && missing.length > 0 && (
        <div className="rounded-2xl border-2 border-secondary bg-secondary/10 p-4 text-sm">
          <p className="font-semibold mb-1">Complétez votre profil pour continuer</p>
          <p className="text-muted-foreground">
            Toutes les cases doivent être remplies pour postuler aux offres et obtenir le numéro
            des employeurs. Il manque : <strong>{missing.join(", ")}</strong>.
          </p>
        </div>
      )}

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
                required={candidateRequired || isEmployer}
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
            required={candidateRequired}
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

        {addressEditable && (
          <Field
            label="Adresse précise"
            htmlFor="address"
            hint="Rue, numéro, repère. Visible seulement par vous et l'équipe Madame Dacosta, jamais sur votre fiche."
          >
            <Input
              id="address"
              name="address"
              required={candidateRequired}
              minLength={3}
              maxLength={200}
              defaultValue={candidateAddress ?? ""}
              placeholder="Ex : 12 rue Mbochi, derrière l'église Saint-Pierre"
            />
          </Field>
        )}
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

          <div>
            <MetierPicker
              name="jobTitle"
              legend="Poste recherché"
              required={candidateRequired}
              defaultValue={candidate?.jobTitle}
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
                required={candidateRequired}
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
                required={candidateRequired}
                defaultValue={candidate?.age ?? ""}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Disponibilité" htmlFor="availability">
              <select
                id="availability"
                name="availability"
                required={candidateRequired}
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
                required={candidateRequired}
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
              required={candidateRequired}
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
              required={candidateRequired}
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
              required={candidateRequired}
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
              required={candidateRequired}
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
              required={candidateRequired}
              defaultValue={candidate?.languages.join(", ") ?? ""}
              placeholder="français, lingala"
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
