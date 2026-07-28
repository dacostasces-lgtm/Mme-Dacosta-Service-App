import Image, { type StaticImageData } from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import nounou from "@/assets/images/metier-nounou.jpg";
import menage from "@/assets/images/metier-menage.jpg";
import cuisine from "@/assets/images/metier-cuisine.jpg";
import chauffeur from "@/assets/images/metier-chauffeur.jpg";
import linge from "@/assets/images/metier-linge.jpg";
import gouvernante from "@/assets/images/metier-gouvernante.jpg";

type Category = {
  label: string;
  blurb: string;
  image: StaticImageData;
  alt: string;
  /* Feeds the `q` param of search_candidates, so every tile is a real search. */
  query: string;
};

const CATEGORIES: Category[] = [
  {
    label: "Nounou",
    blurb: "Garde d'enfants à domicile",
    image: nounou,
    alt: "Une nounou porte un bébé dans ses bras",
    query: "Nounou",
  },
  {
    label: "Ménagère",
    blurb: "Entretien courant du logement",
    image: menage,
    alt: "Une aide-ménagère nettoie une table dans un salon",
    query: "Ménagère",
  },
  {
    label: "Cuisinier",
    blurb: "Repas quotidiens et réceptions",
    image: cuisine,
    alt: "Une cuisinière découpe des légumes dans une cuisine",
    query: "Cuisinier",
  },
  {
    label: "Chauffeur",
    blurb: "Trajets famille et professionnels",
    image: chauffeur,
    alt: "Un chauffeur au volant d'une voiture",
    query: "Chauffeur",
  },
  {
    label: "Linge & repassage",
    blurb: "Lessive, repassage, rangement",
    image: linge,
    alt: "Une femme repasse du linge près d'une fenêtre",
    query: "Repassage",
  },
  {
    label: "Gouvernante",
    blurb: "Intendance complète de la maison",
    image: gouvernante,
    alt: "Une gouvernante range les placards d'une cuisine",
    query: "Gouvernante",
  },
];

export function Categories() {
  return (
    <section className="py-20 sm:py-28 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="eyebrow">Nos métiers</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold">
            Quel profil cherchez-vous&nbsp;?
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Six métiers du personnel de maison, tous soumis à la même vérification de
            dossier avant d&apos;apparaître dans les résultats.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {CATEGORIES.map((category) => (
            <Link
              key={category.label}
              href={`/candidats?q=${encodeURIComponent(category.query)}`}
              className="group relative aspect-4/5 sm:aspect-square lg:aspect-4/5 rounded-2xl sm:rounded-3xl overflow-hidden shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Image
                src={category.image}
                alt={category.alt}
                placeholder="blur"
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 45vw, 30vw"
                className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                fill
              />
              <div className="absolute inset-0 scrim" />

              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 text-white">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h3 className="text-lg sm:text-2xl font-bold">{category.label}</h3>
                    <p className="text-xs sm:text-sm text-white/75 mt-0.5">
                      {category.blurb}
                    </p>
                  </div>
                  <span className="hidden sm:grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 backdrop-blur-sm transition-colors group-hover:bg-secondary group-hover:text-secondary-foreground">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
