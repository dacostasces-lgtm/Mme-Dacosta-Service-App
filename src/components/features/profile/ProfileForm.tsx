"use client";

import { submitWithoutReset } from "@/lib/forms";
import { useActionState, useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfile, type ProfileFormState } from "@/lib/profile/actions";
import { PHONE_HINT } from "@/lib/phone";
import type { NeighborhoodOption } from "@/components/features/jobs/JobForm";
import {
  CandidateFields,
  Field,
  FIELD,
  SELECT,
  type CandidateProfile,
} from "@/components/features/profile/CandidateFields";

export type { CandidateProfile };

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
    <form action={formAction} onSubmit={submitWithoutReset(formAction)} className="space-y-8">
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
              : isEmployer
                ? "Où la mission se situera. Une candidate a le droit de savoir où on l'envoie."
                : "C'est ce qui permet aux employeurs de vous trouver par proximité."
          }
        >
          <select
            id="neighborhoodId"
            name="neighborhoodId"
            // Obligatoire des deux côtés : le quartier est devenu une case
            // retenue par la modération pour un employeur aussi, et réclamer
            // dans la file ce que le formulaire laisse facultatif enfermerait
            // la personne sans lui dire quoi corriger.
            required={candidateRequired || isEmployer}
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

          <CandidateFields
            candidate={candidate}
            required={candidateRequired}
            familyEditable={familyEditable}
          />
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
