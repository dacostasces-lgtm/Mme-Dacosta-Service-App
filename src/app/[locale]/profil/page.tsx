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
  const user = await requireUser();
  const supabase = await createClient();
  const isEmployer = user.role === "employer";

  const [profileResult, neighborhoodResult, contactResult, detailsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, neighborhood_id, avatar_url")
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
      : supabase
          .from("candidate_details")
          .select("job_title, age, gender, experience, desired_salary, availability, description, languages, skills, cv_url")
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
            employer={employer}
          />
        </div>
      </div>
    </div>
  );
}
