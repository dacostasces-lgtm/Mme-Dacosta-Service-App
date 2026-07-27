import { notFound } from "next/navigation";
import { MapPin, Star, BadgeCheck, CheckCircle2, Circle, FileText, Phone, Award, Clock, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

type Candidate = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  is_premium: boolean;
  is_validated: boolean;
  neighborhood: string | null;
  city: string | null;
  job_title: string | null;
  experience: string | null;
  description: string | null;
  skills: string[] | null;
  languages: string[] | null;
  desired_salary: number | null;
  availability: string | null;
  distance_km: number | null;
  rating: number | string | null;
  reviews_count: number | string | null;
  identity_checked_at: string | null;
  criminal_record_checked_at: string | null;
  interview_passed_at: string | null;
};

const AVAILABILITY_LABELS: Record<string, string> = {
  full_time: "Temps Plein",
  part_time: "Temps Partiel",
  internal: "Interne (Logé)",
  external: "Externe",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatSalary(amount: number | null) {
  if (!amount) return "À discuter";
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA / mois`;
}

/** Tolerates a jsonb column that holds either a real array or nothing yet. */
function toList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_candidate", { candidate_id: id });
  const profile = (data?.[0] ?? null) as Candidate | null;

  // Unknown id, not a candidate, or still awaiting moderation: RLS returns
  // nothing and the page is simply not found.
  if (!profile) notFound();

  const skills = toList(profile.skills);
  const languages = toList(profile.languages);
  const place = [profile.neighborhood, profile.city].filter(Boolean).join(", ");
  const reviewsCount = Number(profile.reviews_count ?? 0);
  const rating = Number(profile.rating ?? 0);
  const verifications = [
    { label: "Identité vérifiée", at: profile.identity_checked_at },
    { label: "Casier judiciaire vierge", at: profile.criminal_record_checked_at },
    { label: "Entretien passé", at: profile.interview_passed_at },
  ];

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header Section */}
        <div className="bg-card rounded-3xl p-8 border border-border shadow-sm mb-8 relative overflow-hidden">
          {profile.is_premium && (
            <div className="absolute top-0 right-0 bg-secondary text-secondary-foreground px-4 py-1 rounded-bl-xl text-sm font-semibold flex items-center gap-1">
              <BadgeCheck className="h-4 w-4" /> Profil Premium
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="h-32 w-32 rounded-full bg-surface border-4 border-background shadow-lg overflow-hidden flex-shrink-0">
              <img
                src={profile.avatar_url ?? `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(profile.full_name)}`}
                alt={profile.full_name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-3xl font-bold">{profile.full_name}</h1>
                {profile.is_premium && <BadgeCheck className="h-6 w-6 text-secondary" />}
              </div>
              <p className="text-primary font-medium text-xl mb-4">
                {profile.job_title ?? "Profil en cours de complétion"}
              </p>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
                {place && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {place}
                    {profile.distance_km !== null && (
                      <span className="text-primary font-medium">({profile.distance_km} km)</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-secondary fill-secondary" />
                  {reviewsCount > 0 ? (
                    <>
                      <span className="font-medium text-foreground">{rating}</span> ({reviewsCount} avis)
                    </>
                  ) : (
                    "Pas encore d'avis"
                  )}
                </div>
                {profile.experience && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {profile.experience} d&apos;expérience
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button size="lg" className="rounded-full px-8 shadow-md">
                  <Phone className="mr-2 h-4 w-4" /> Contacter
                </Button>
                <Button size="lg" variant="outline" className="rounded-full px-8">
                  <FileText className="mr-2 h-4 w-4" /> Proposer une offre
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            <section className="bg-card rounded-3xl p-8 border border-border shadow-sm">
              <h2 className="text-xl font-bold mb-4">À propos</h2>
              <p className="text-muted-foreground leading-relaxed">
                {profile.description ?? "Ce candidat n'a pas encore rédigé sa présentation."}
              </p>
            </section>

            {skills.length > 0 && (
              <section className="bg-card rounded-3xl p-8 border border-border shadow-sm">
                <h2 className="text-xl font-bold mb-4">Compétences</h2>
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="px-3 py-1.5 text-sm font-normal">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {languages.length > 0 && (
              <section className="bg-card rounded-3xl p-8 border border-border shadow-sm">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Languages className="h-5 w-5 text-primary" />
                  Langues parlées
                </h2>
                <div className="flex flex-wrap gap-2">
                  {languages.map((language) => (
                    <Badge key={language} variant="secondary" className="px-3 py-1.5 text-sm font-normal">
                      {language}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <section className="bg-surface rounded-3xl p-6 border border-border">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                Vérifications
              </h3>
              {/* Each line reflects a check an admin actually recorded, with the
                  date it was carried out. Nothing is asserted by default. */}
              <ul className="space-y-3">
                {verifications.map(({ label, at }) => (
                  <li
                    key={label}
                    className={`flex items-center gap-2 text-sm ${at ? "text-muted-foreground" : "text-muted-foreground/50"}`}
                  >
                    {at ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0" />
                    )}
                    <span>
                      {label}
                      {at ? (
                        <span className="block text-xs">Vérifié le {formatDate(at)}</span>
                      ) : (
                        <span className="block text-xs italic">Non vérifié</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-card rounded-3xl p-6 border border-border shadow-sm">
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Disponibilité</h3>
              <p className="font-medium text-lg mb-4">
                {AVAILABILITY_LABELS[profile.availability ?? ""] ?? "À préciser"}
              </p>

              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Prétention Salariale</h3>
              <p className="font-medium text-lg">{formatSalary(profile.desired_salary)}</p>
            </section>
          </div>
        </div>

      </div>
    </div>
  );
}
