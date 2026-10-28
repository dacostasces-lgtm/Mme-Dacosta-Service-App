import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  MapPin,
  Star,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Award,
  Clock,
  Languages,
  Cake,
  Users,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/dal";
import { Badge } from "@/components/ui/badge";
import { ShareButton } from "@/components/shared/ShareButton";
import { ReviewList, type ReviewRow } from "@/components/features/reviews/ReviewList";
import {
  CandidateNumber,
  CandidateNumberPayment,
  type CandidateContactRow,
} from "@/components/features/contact/CandidateContact";
import { localisedUrl } from "@/lib/site";
import { availabilityLabel } from "@/lib/candidates/availability";
import { childrenSummary, maritalStatusLabel } from "@/lib/candidates/family";
import { formatHours, formatWorkDays } from "@/lib/jobs/schedule";
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
  work_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  live_in: boolean | null;
};

/** Une ligne de candidate_situation() (20261022000000_situation_familiale.sql). */
type SituationRow = {
  age: number | null;
  marital_status: string | null;
  children_count: number | null;
  youngest_child_age: number | null;
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

/**
 * Une étiquette par compétence ou par langue. Celles du composant Badge tiennent
 * sur une ligne de hauteur fixe : une compétence écrite en phrase sortait alors
 * de la carte, coupée sous la colonne de droite. Ici le texte revient à la
 * ligne dans son étiquette.
 */
const TAG = "h-auto max-w-full whitespace-normal break-words text-left px-3 py-1.5 text-sm font-normal";

/** Tolerates a jsonb column that holds either a real array or nothing yet. */
function toList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Ce qu'affiche un lien partagé (WhatsApp, Facebook) : sans titre ni
 * description, l'aperçu ne montrait que le nom du site. Le prénom et le métier
 * sont déjà sur la page publique ; rien de plus n'est exposé ici.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Profil introuvable" };

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_candidate", { candidate_id: id });
  const profile = (data?.[0] ?? null) as Candidate | null;
  if (!profile) return { title: "Profil introuvable", robots: { index: false, follow: false } };

  const title = profile.job_title ? `${profile.full_name} — ${profile.job_title}` : profile.full_name;
  const place = [profile.neighborhood, profile.city].filter(Boolean).join(", ");
  const description = [
    profile.job_title ?? "Profil",
    place && `à ${place}`,
    profile.experience && `${profile.experience} d'expérience`,
    "profil vérifié sur Madame Dacosta Services.",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    title,
    description,
    alternates: { canonical: localisedUrl(`/candidats/${profile.id}`) },
    openGraph: {
      type: "profile",
      title,
      description,
      url: localisedUrl(`/candidats/${profile.id}`),
      ...(profile.avatar_url ? { images: [{ url: profile.avatar_url }] } : {}),
    },
    // Un profil encore en attente n'est visible que de son titulaire.
    robots: profile.is_validated ? undefined : { index: false, follow: false },
  };
}

export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Les avis en même temps que la fiche : la note moyenne vient de
  // `get_candidate`, mais pas les textes, et une note sans son avis ne dit rien.
  const [{ data }, avis] = await Promise.all([
    supabase.rpc("get_candidate", { candidate_id: id }),
    supabase
      .from("reviews")
      .select("id, rating, comment, created_at")
      .eq("reviewee_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
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

  const visiteur = await getCurrentUser();
  const estSoiMeme = visiteur?.profileId === profile.id;

  // Le numéro, ou ce qu'il faut payer pour l'avoir : candidate_contact()
  // décide seule qui y a droit. Une erreur (migration pas encore appliquée)
  // laisse simplement la place vide.
  const contact = estSoiMeme
    ? undefined
    : ((await supabase.rpc("candidate_contact", { p_candidate_id: profile.id })).data?.[0] as
        | CandidateContactRow
        | undefined);

  // Âge et situation familiale : pour un employeur connecté, l'administration
  // ou la candidate elle-même — candidate_situation() en décide et ne renvoie
  // rien aux autres (20261022000000). Un visiteur voit de quoi se connecter.
  const voitSituation =
    estSoiMeme || visiteur?.role === "employer" || visiteur?.role === "admin";
  const situation = voitSituation
    ? ((await supabase.rpc("candidate_situation", { p_candidate_id: profile.id })).data?.[0] as
        | SituationRow
        | undefined)
    : undefined;

  const initials = profile.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex-1 bg-surface bg-grain py-10 sm:py-14">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header Section */}
        <div className="bg-card rounded-3xl border border-border shadow-soft mb-8 relative overflow-hidden">
          {profile.is_premium && (
            <div className="absolute top-0 right-0 bg-secondary text-secondary-foreground px-4 py-1 rounded-bl-xl text-sm font-semibold flex items-center gap-1 z-10">
              <BadgeCheck className="h-4 w-4" /> Profil Premium
            </div>
          )}

          {/* Tinted band, matching the ProfileCard the visitor just came from. */}
          <div
            aria-hidden
            className={`h-24 ${
              profile.is_premium
                ? "bg-gradient-to-r from-secondary/25 via-secondary/10 to-transparent"
                : "bg-gradient-to-r from-primary/12 via-primary/5 to-transparent"
            }`}
          />

          <div className="p-8 flex flex-col md:flex-row gap-8 items-start">
            {/* -mt-20 lifts the avatar into the band above without dragging the
                text column up with it. */}
            <div className="-mt-20 h-32 w-32 rounded-3xl ring-4 ring-card shadow-soft overflow-hidden flex-shrink-0 grid place-items-center bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-display text-4xl font-bold">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                initials
              )}
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
                {situation?.age && (
                  <div className="flex items-center gap-1">
                    <Cake className="h-4 w-4" />
                    {situation.age} ans
                  </div>
                )}
              </div>

              {/* Ces deux boutons étaient inertes : aucun gestionnaire, aucun
                  lien. Le tunnel de réservation — et donc tout l'encaissement —
                  n'était atteignable depuis nulle part. */}
              {estSoiMeme ? (
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/profil"
                    className={buttonVariants({
                      variant: "outline",
                      className: "h-12 rounded-full px-8",
                    })}
                  >
                    Modifier mon profil
                  </Link>
                  {/* Un profil encore en attente de validation n'est visible
                      que de son titulaire : le lien n'ouvrirait rien. */}
                  {profile.is_validated && (
                    <ShareButton
                      url={localisedUrl(`/candidats/${profile.id}`)}
                      title={profile.full_name}
                      text={`${profile.job_title ?? "Mon profil"} — je suis disponible. Mon profil vérifié sur Madame Dacosta Services :`}
                      label="Partager mon profil"
                      align="left"
                    />
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {/* Plus de « Réserver ce candidat » : la réservation
                      facturait 15 000 FCFA une mise en relation que le
                      déblocage ci-dessous facture 500. Deux chemins vers le
                      même service, à trente fois l'écart, et celui-ci est le
                      seul que la grille tarifaire annonce. */}
                  {/* À la place de « Contacter », qui ouvrait une messagerie
                      vide : le numéro, ou le paiement qui l'ouvre. */}
                  <CandidateNumber
                    contact={contact}
                    viewerRole={visiteur?.role ?? "visitor"}
                    candidateId={profile.id}
                    jobTitle={profile.job_title}
                  />
                  {profile.is_validated && (
                    <ShareButton
                      url={localisedUrl(`/candidats/${profile.id}`)}
                      title={profile.full_name}
                      text={`${profile.job_title ?? "Profil"} : ${profile.full_name}, profil vérifié sur Madame Dacosta Services :`}
                      align="left"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <CandidateNumberPayment contact={contact} />

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">

            {skills.length > 0 && (
              <section className="bg-card rounded-3xl p-8 border border-border shadow-soft">
                <h2 className="text-xl font-bold mb-4">Compétences</h2>
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className={TAG}>
                      {skill}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {languages.length > 0 && (
              <section className="bg-card rounded-3xl p-8 border border-border shadow-soft">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Languages className="h-5 w-5 text-primary" />
                  Langues parlées
                </h2>
                <div className="flex flex-wrap gap-2">
                  {languages.map((language) => (
                    <Badge key={language} variant="secondary" className={TAG}>
                      {language}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

              <ReviewList reviews={(avis.data ?? []) as ReviewRow[]} />
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {situation ? (
              <section className="bg-card rounded-3xl p-6 border border-border shadow-soft">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Situation familiale
                </h3>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Âge</h4>
                <p className="font-medium mb-4">
                  {situation.age ? `${situation.age} ans` : "Non renseigné"}
                </p>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">
                  Situation matrimoniale
                </h4>
                <p className="font-medium mb-4">
                  {maritalStatusLabel(situation.marital_status) ?? "Non renseignée"}
                </p>
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Enfants</h4>
                <p className="font-medium">
                  {childrenSummary(situation.children_count, situation.youngest_child_age) ??
                    "Non renseigné"}
                </p>
                {estSoiMeme && (
                  <p className="text-xs text-muted-foreground mt-4">
                    Visible des employeurs inscrits et de notre équipe, pas du public.
                  </p>
                )}
              </section>
            ) : (
              !visiteur && (
                <section className="bg-surface rounded-3xl p-6 border border-border">
                  <h3 className="font-bold mb-2 flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Âge et situation familiale
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Visibles par les employeurs inscrits.
                  </p>
                  <Link href="/login" className="text-sm font-medium text-primary hover:underline">
                    Se connecter →
                  </Link>
                </section>
              )
            )}

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

            <section className="bg-card rounded-3xl p-6 border border-border shadow-soft">
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Disponibilité</h3>
              <p className="font-medium text-lg mb-4">
                {availabilityLabel(profile.availability)}
              </p>

              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Jours</h3>
              <p className="font-medium mb-4">{formatWorkDays(profile.work_days) ?? "À convenir"}</p>

              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Horaires</h3>
              <p className="font-medium mb-4">
                {formatHours(profile.start_time, profile.end_time) ?? "À convenir"}
              </p>

              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Dormir sur place</h3>
              <p className="font-medium mb-4">{profile.live_in ? "Oui, accepte" : "Non"}</p>

              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Prétention Salariale</h3>
              <p className="font-medium text-lg">{formatSalary(profile.desired_salary)}</p>
            </section>
          </div>
        </div>

      </div>
    </div>
  );
}
