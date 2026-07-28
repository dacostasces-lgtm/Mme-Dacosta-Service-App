import { MapPin, Star, BadgeCheck, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

interface ProfileCardProps {
  id: string;
  name: string;
  jobTitle: string;
  neighborhood: string;
  distance?: number;
  rating: number;
  isPremium: boolean;
  availability: string;
  avatarUrl?: string;
}

export function ProfileCard({
  name,
  jobTitle,
  neighborhood,
  distance,
  rating,
  isPremium,
  availability,
  id,
  avatarUrl,
}: ProfileCardProps) {
  // Fallback is initials on the brand gradient rather than a generated cartoon:
  // it reads as deliberate, and costs no third-party request.
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  // A candidate with no completed mission has no rating yet — showing "0.0 / 5"
  // reads as a bad score instead of an absent one.
  const hasRating = rating > 0;

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-3xl bg-card transition-all duration-300 hover:-translate-y-1 ${
        isPremium
          ? "border border-secondary/45 shadow-soft hover:shadow-lift"
          : "border border-border shadow-soft hover:shadow-lift"
      }`}
    >
      {/* Tinted band behind the avatar — gold for premium, brand pink otherwise. */}
      <div
        aria-hidden
        className={`h-20 ${
          isPremium
            ? "bg-gradient-to-r from-secondary/25 via-secondary/10 to-transparent"
            : "bg-gradient-to-r from-primary/12 via-primary/5 to-transparent"
        }`}
      />

      <div className="px-6 pb-6 -mt-10 flex flex-col flex-1">
        <div className="flex items-end justify-between gap-3">
          <span className="h-20 w-20 rounded-2xl overflow-hidden ring-4 ring-card shadow-soft shrink-0 grid place-items-center bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-display text-2xl font-bold">
            {avatarUrl ? (
              // Candidate avatars live on Supabase storage, whose host is
              // env-dependent, so they stay on a plain <img> rather than
              // next/image's allowlist.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          {isPremium && (
            <Badge className="mb-1 bg-secondary text-secondary-foreground font-semibold">
              Premium
            </Badge>
          )}
        </div>

        <div className="mt-4">
          <h3 className="font-bold text-lg leading-tight flex items-center gap-1.5">
            <span className="truncate">{name}</span>
            {isPremium && (
              <BadgeCheck className="h-4 w-4 text-secondary shrink-0" aria-label="Vérifié" />
            )}
          </h3>
          <p className="text-primary font-medium text-sm mt-0.5">{jobTitle}</p>
        </div>

        <dl className="mt-4 space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Quartier</dt>
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <dd className="truncate">
              {neighborhood}
              {distance !== undefined && (
                <span className="text-primary font-medium"> · {distance} km</span>
              )}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Note</dt>
            <Star
              className={`h-3.5 w-3.5 shrink-0 ${
                hasRating ? "text-secondary fill-secondary" : "text-muted-foreground/50"
              }`}
              aria-hidden
            />
            <dd>
              {hasRating ? (
                <>
                  <span className="font-medium text-foreground">{rating.toFixed(1)}</span> / 5
                </>
              ) : (
                "Pas encore d'avis"
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-4 mb-6">
          <Badge variant="outline" className="font-normal">
            {availability}
          </Badge>
        </div>

        <Link
          href={`/candidats/${id}`}
          // cn(), not buttonVariants({ className }): cva only concatenates, so a
          // border-colour override loses to the variant's own `border-border`
          // depending on stylesheet order. tailwind-merge actually drops it.
          className={cn(
            buttonVariants({ variant: "outline" }),
            // mt-auto pins the CTA to the bottom so buttons line up across a
            // row of cards whose text runs to different lengths.
            "mt-auto h-11 w-full rounded-full gap-2 border-2 border-primary/30 text-primary hover:bg-accent hover:text-primary group-hover:border-primary/70"
          )}
        >
          Voir le profil
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </article>
  );
}
