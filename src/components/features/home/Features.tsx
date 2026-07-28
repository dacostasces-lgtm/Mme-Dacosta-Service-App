import Image from "next/image";
import { ShieldCheck, MapPin, Star, HandCoins } from "lucide-react";
import famille from "@/assets/images/famille-canape.jpg";

const POINTS = [
  {
    icon: ShieldCheck,
    title: "Profils vérifiés",
    text: "Pièce d'identité, références et casier : aucun profil n'est publié tant que le dossier n'est pas contrôlé par notre équipe.",
  },
  {
    icon: MapPin,
    title: "Recherche par quartier",
    text: "La géolocalisation trie les candidats par distance réelle. Un trajet court, c'est un personnel qui reste.",
  },
  {
    icon: Star,
    title: "Avis de la communauté",
    text: "Chaque mission peut être notée par l'employeur. Les évaluations restent visibles sur le profil.",
  },
  {
    icon: HandCoins,
    title: "Sans commission cachée",
    text: "La mise en relation est directe. Vous ne payez que l'abonnement, jamais un pourcentage du salaire.",
  },
];

export function Features() {
  return (
    <section className="py-20 sm:py-28 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="relative order-last lg:order-first">
            <div className="relative aspect-4/3 rounded-[2rem] overflow-hidden shadow-lift">
              <Image
                src={famille}
                alt="Une famille réunie dans son salon"
                placeholder="blur"
                sizes="(max-width: 1024px) 90vw, 45vw"
                className="object-cover"
                fill
              />
            </div>
            {/* Decorative gold frame, offset behind the photo. */}
            <div
              aria-hidden
              className="absolute -bottom-5 -left-5 -z-10 h-40 w-40 rounded-[2rem] border-2 border-secondary/40"
            />
          </div>

          <div>
            <span className="eyebrow">Pourquoi Madame Dacosta</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold">
              Recruter chez soi, ça ne s&apos;improvise pas.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Confier sa maison et ses enfants demande des garanties. Nous les apportons
              avant même que vous décrochiez votre téléphone.
            </p>

            <div className="mt-10 grid sm:grid-cols-2 gap-x-8 gap-y-9">
              {POINTS.map((point) => (
                <div key={point.title}>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-primary">
                    <point.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{point.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {point.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
