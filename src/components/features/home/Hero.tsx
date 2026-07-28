import Image from "next/image";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import heroPortrait from "@/assets/images/hero-portrait.jpg";
import temoin1 from "@/assets/images/temoin-1.jpg";
import temoin2 from "@/assets/images/temoin-2.jpg";
import temoin3 from "@/assets/images/temoin-3.jpg";

const FACES = [
  { src: temoin1, alt: "" },
  { src: temoin2, alt: "" },
  { src: temoin3, alt: "" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-surface bg-mesh bg-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="animate-rise text-center lg:text-left">
            <span className="eyebrow">Personnel de maison vérifié</span>

            <h1 className="mt-5 text-4xl sm:text-5xl xl:text-6xl font-bold leading-[1.05] text-foreground">
              Le personnel de maison{" "}
              <span className="relative inline-block text-primary">
                d&apos;exception
                {/* Hand-drawn underline: a plain border would read as a link. */}
                <svg
                  aria-hidden
                  viewBox="0 0 200 12"
                  preserveAspectRatio="none"
                  className="absolute -bottom-1 left-0 w-full h-2.5 text-secondary"
                >
                  <path
                    d="M2 8 C 50 2, 150 2, 198 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>{" "}
              près de chez vous.
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Nounous, ménagères, chauffeurs et cuisiniers de confiance. Chaque dossier est
              contrôlé avant publication, et la recherche se fait par quartier.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3">
              <Link
                href="/candidats"
                className={buttonVariants({
                  size: "lg",
                  className:
                    "h-14 px-8 text-base rounded-full w-full sm:w-auto shadow-glow transition-transform hover:-translate-y-0.5",
                })}
              >
                Rechercher un profil
              </Link>
              <Link
                href="/offres/creer"
                className={buttonVariants({
                  size: "lg",
                  variant: "outline",
                  className: "h-14 px-8 text-base rounded-full w-full sm:w-auto",
                })}
              >
                Déposer une offre
              </Link>
            </div>

            <div className="mt-10 flex items-center justify-center lg:justify-start gap-4">
              {/* shrink-0: without it the stack is squeezed by the sentence and
                  the avatars ride over the text on narrow screens. */}
              <div className="flex shrink-0 -space-x-3">
                {FACES.map((face, i) => (
                  <Image
                    key={i}
                    src={face.src}
                    alt={face.alt}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-surface"
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground text-left">
                <span className="font-semibold text-foreground">+400 profils</span> déjà
                vérifiés à Brazzaville et Pointe-Noire.
              </p>
            </div>
          </div>

          {/* Portrait + two facts lifted off the photo, so the visual carries
              information instead of being pure decoration. */}
          <div className="relative animate-rise [animation-delay:150ms] mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative aspect-4/5 rounded-[2rem] overflow-hidden shadow-lift">
              <Image
                src={heroPortrait}
                alt="Une cuisinière prépare un repas dans une cuisine lumineuse"
                placeholder="blur"
                priority
                sizes="(max-width: 1024px) 90vw, 45vw"
                className="object-cover"
                fill
              />
              <div className="absolute inset-0 scrim opacity-70" />
            </div>

            <div className="absolute -left-3 sm:-left-6 top-8 bg-card/95 backdrop-blur-sm rounded-2xl shadow-lift px-4 py-3 flex items-center gap-3">
              <span className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold leading-tight">
                Dossier vérifié
                <span className="block text-xs font-normal text-muted-foreground">
                  Pièce d&apos;identité et références
                </span>
              </span>
            </div>

            <div className="absolute -right-3 sm:-right-6 bottom-10 bg-card/95 backdrop-blur-sm rounded-2xl shadow-lift px-4 py-3">
              <div className="flex items-center gap-1 text-secondary">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-current" />
                ))}
              </div>
              <p className="mt-1 text-sm font-semibold leading-tight">4,8 / 5</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Bacongo, Brazzaville
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
