import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { NeighborhoodOption } from "@/components/features/jobs/JobForm";
import {
  ProfileForm,
  type CandidateProfile,
  type EmployerProfile,
} from "@/components/features/profile/ProfileForm";
import { FileUploads } from "@/components/features/profile/FileUploads";
import { PhoneVerification } from "@/components/features/profile/PhoneVerification";
import { isOtpConfigured } from "@/lib/otp/infobip";

export const metadata: Metadata = {
  title: "Mon profil",
  robots: { index: false, follow: false },
};

type NeighborhoodRow = { id: string; name: string; cities: { name: string } | null };

/** Stored as JSONB, so anything could come back — keep only the strings. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export default async function ProfilePage() {
  // Exemptée de la porte de vérification : c'est ici qu'on corrige son numéro,
  // et qu'on le vérifie via le bloc dédié. L'y soumettre renverrait quelqu'un
  // vers l'écran de vérification au moment même où il vient de saisir son
  // numéro — en pleine édition, sans avoir rien demandé.
  const user = await requireUser({ allowUnverifiedPhone: true });
  const supabase = await createClient();
  const isEmployer = user.role === "employer";

  const [profileResult, neighborhoodResult, contactResult, detailsResult, addressResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, neighborhood_id, avatar_url, phone_verified_at")
      .eq("id", user.profileId ?? "")
      .maybeSingle(),
    supabase.from("neighborhoods").select("id, name, cities(name)").order("name"),
    // Own phone/whatsapp: the table columns are revoked, this is the only way
    // back to them. Errors if the PII migration hasn't been applied yet.
    supabase.rpc("my_contact"),
    isEmployer
      ? supabase
          .from("employer_details")
          .select("company_name, address, description")
          .eq("profile_id", user.profileId ?? "")
          .maybeSingle()
      : // Par fonction, et non par la table : depuis
        // 20261017110000_details_candidat_prives, l'âge, le sexe et le CV ne
        // sont plus lisibles par colonne — ils l'étaient pour tout le monde dès
        // que le profil était publié.
        supabase.rpc("my_candidate_details").then((r) => ({
          ...r,
          data: (r.data as unknown[] | null)?.[0] ?? null,
        })),
    // Adresse précise du candidat, dans sa table privée. Erreur tant que
    // 20261012000000_candidate_address.sql n'est pas passée : le champ est
    // alors simplement masqué.
    isEmployer
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("candidate_addresses")
          .select("address")
          .eq("profile_id", user.profileId ?? "")
          .maybeSingle(),
  ]);

  const neighborhoods: NeighborhoodOption[] = (
    (neighborhoodResult.data ?? []) as unknown as NeighborhoodRow[]
  ).map((row) => ({
    id: row.id,
    label: [row.name, row.cities?.name].filter(Boolean).join(", "),
  }));

  const contact = (contactResult.data ?? [])[0] as
    | { phone: string | null; whatsapp: string | null }
    | undefined;
  const contactEditable = !contactResult.error;

  const details = detailsResult.data as Record<string, unknown> | null;

  const candidate: CandidateProfile | undefined = isEmployer
    ? undefined
    : {
        jobTitle: (details?.job_title as string) ?? null,
        age: (details?.age as number) ?? null,
        gender: (details?.gender as string) ?? null,
        experience: (details?.experience as string) ?? null,
        desiredSalary: (details?.desired_salary as number) ?? null,
        availability: (details?.availability as string) ?? null,
        description: (details?.description as string) ?? null,
        languages: stringList(details?.languages),
        skills: stringList(details?.skills),
        workDays: stringList(details?.work_days),
        startTime: (details?.start_time as string) ?? null,
        endTime: (details?.end_time as string) ?? null,
        liveIn: Boolean(details?.live_in),
        maritalStatus: (details?.marital_status as string) ?? null,
        childrenCount: (details?.children_count as number) ?? null,
        youngestChildAge: (details?.youngest_child_age as number) ?? null,
      };

  const employer: EmployerProfile | undefined = isEmployer
    ? {
        companyName: (details?.company_name as string) ?? null,
        address: (details?.address as string) ?? null,
        description: (details?.description as string) ?? null,
      }
    : undefined;

  return (
    <div className="flex-1 bg-surface bg-grain py-10 sm:py-14">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-2">Mon profil</h1>
        <p className="text-muted-foreground mb-8">
          {isEmployer
            ? "Ces informations rassurent les candidats sur le poste que vous proposez."
            : "Un profil complet est ce qui vous fait remarquer. Prenez le temps de le remplir : c'est ce que les familles lisent avant de vous contacter."}
        </p>

        <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft mb-6">
          <FileUploads
            userId={user.id}
            isCandidate={!isEmployer}
            avatarUrl={(profileResult.data?.avatar_url as string) ?? null}
            fullName={profileResult.data?.full_name ?? user.fullName}
            hasCv={Boolean(details?.cv_url)}
          />
        </div>

        {/* Avant le formulaire : c'est le numéro déjà enregistré qu'on vérifie,
            pas celui en cours de saisie. Le placer après donnerait à penser
            qu'il faut enregistrer d'abord. */}
        <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft mb-6">
          <PhoneVerification
            phone={contact?.phone ?? null}
            verifiedAt={(profileResult.data?.phone_verified_at as string) ?? null}
            available={isOtpConfigured()}
          />
        </div>

        <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft">
          <ProfileForm
            role={user.role}
            fullName={profileResult.data?.full_name ?? user.fullName}
            phone={contact?.phone ?? null}
            whatsapp={contact?.whatsapp ?? null}
            contactEditable={contactEditable}
            neighborhoodId={(profileResult.data?.neighborhood_id as string) ?? null}
            neighborhoods={neighborhoods}
            candidate={candidate}
            candidateAddress={(addressResult.data?.address as string | undefined) ?? null}
            addressEditable={!isEmployer && !addressResult.error}
            // Les colonnes n'arrivent qu'avec 20261022000000 : tant que la
            // fonction ne les renvoie pas, les cases restent masquées plutôt
            // qu'exigées sans pouvoir être enregistrées.
            familyEditable={!isEmployer && (details === null || "marital_status" in (details ?? {}))}
            employer={employer}
            missing={user.missingProfileFields}
          />
        </div>
      </div>
    </div>
  );
}
