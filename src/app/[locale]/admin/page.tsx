import { ShieldCheck, Clock, MapPin, Mail, Undo2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { setProfileValidation, setCandidateCheck, type CandidateCheck } from "@/lib/admin/actions";

type CandidateDetails = {
  job_title: string | null;
  experience: string | null;
  identity_checked_at: string | null;
  criminal_record_checked_at: string | null;
  interview_passed_at: string | null;
};

type ModerationProfile = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  created_at: string;
  neighborhoods: { name: string; cities: { name: string; country: string } | null } | null;
  candidate_details: CandidateDetails | null;
};

const SELECT =
  "id, full_name, email, role, created_at, " +
  "neighborhoods(name, cities(name, country)), " +
  "candidate_details(job_title, experience, identity_checked_at, " +
  "criminal_record_checked_at, interview_passed_at)";

const CHECKS: { key: CandidateCheck; label: string; field: keyof CandidateDetails }[] = [
  { key: "identity", label: "Identité", field: "identity_checked_at" },
  { key: "criminal_record", label: "Casier", field: "criminal_record_checked_at" },
  { key: "interview", label: "Entretien", field: "interview_passed_at" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function VerificationToggles({ profile }: { profile: ModerationProfile }) {
  const details = profile.candidate_details;

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
      <span className="text-xs text-muted-foreground self-center mr-1">Vérifications :</span>
      {CHECKS.map(({ key, label, field }) => {
        const done = Boolean(details?.[field]);
        return (
          <form key={key} action={setCandidateCheck.bind(null, profile.id, key, !done)}>
            <Button
              type="submit"
              variant={done ? "secondary" : "outline"}
              size="sm"
              className="rounded-full gap-1"
              title={done ? `Retirer : ${label}` : `Confirmer : ${label}`}
            >
              {done ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-40" />}
              {label}
            </Button>
          </form>
        );
      })}
    </div>
  );
}

function ProfileRow({ profile, validated }: { profile: ModerationProfile; validated: boolean }) {
  const city = profile.neighborhoods?.cities;
  const place = [profile.neighborhoods?.name, city?.name].filter(Boolean).join(", ");
  const isCandidate = profile.role === "candidate";

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-12 w-12 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold uppercase">
          {profile.full_name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{profile.full_name}</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-muted-foreground">
              {profile.role === "employer" ? "Employeur" : profile.role === "admin" ? "Admin" : "Candidat"}
            </span>
          </div>

          {profile.candidate_details?.job_title && (
            <p className="text-sm text-muted-foreground truncate">
              {profile.candidate_details.job_title}
              {profile.candidate_details.experience && ` · ${profile.candidate_details.experience}`}
            </p>
          )}

          <div className="flex items-center gap-4 flex-wrap mt-1 text-xs text-muted-foreground">
            {profile.email && (
              <span className="flex items-center gap-1 min-w-0">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{profile.email}</span>
              </span>
            )}
            {place && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {place}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              Inscrit le {formatDate(profile.created_at)}
            </span>
          </div>
        </div>

        <form action={setProfileValidation.bind(null, profile.id, !validated)} className="shrink-0">
          <Button type="submit" variant={validated ? "outline" : "default"} className="h-10 rounded-full px-4 gap-2">
            {validated ? (
              <>
                <Undo2 className="h-4 w-4" />
                Retirer
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Publier
              </>
            )}
          </Button>
        </form>
      </div>

      {isCandidate && <VerificationToggles profile={profile} />}
    </div>
  );
}

export default async function AdminPage() {
  await requireUser({ role: "admin" });

  const supabase = await createClient();
  const [pending, validated] = await Promise.all([
    supabase.from("profiles").select(SELECT).eq("is_validated", false).order("created_at"),
    supabase
      .from("profiles")
      .select(SELECT)
      .eq("is_validated", true)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const error = pending.error ?? validated.error;
  const pendingProfiles = (pending.data ?? []) as unknown as ModerationProfile[];
  const validatedProfiles = (validated.data ?? []) as unknown as ModerationProfile[];

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-2">Modération des profils</h1>
        <p className="text-muted-foreground mb-8">
          Un profil n&apos;apparaît dans la recherche qu&apos;une fois publié. Les vérifications que
          vous cochez ici s&apos;affichent sur la fiche publique : ne confirmez que ce que vous avez
          réellement constaté.
        </p>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mb-8">
            Erreur de chargement : {error.message}
          </p>
        )}

        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-4">
            En attente{" "}
            <span className="text-muted-foreground font-normal">({pendingProfiles.length})</span>
          </h2>

          {pendingProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-6 text-center">
              Aucun profil en attente.
            </p>
          ) : (
            <div className="space-y-3">
              {pendingProfiles.map((profile) => (
                <ProfileRow key={profile.id} profile={profile} validated={false} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">
            Profils publiés{" "}
            <span className="text-muted-foreground font-normal">({validatedProfiles.length})</span>
          </h2>

          {validatedProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl p-6 text-center">
              Aucun profil publié pour l&apos;instant.
            </p>
          ) : (
            <div className="space-y-3">
              {validatedProfiles.map((profile) => (
                <ProfileRow key={profile.id} profile={profile} validated />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
