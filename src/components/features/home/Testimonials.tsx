import Image, { type StaticImageData } from "next/image";
import { Quote, Star } from "lucide-react";
import temoin1 from "@/assets/images/temoin-1.jpg";
import temoin2 from "@/assets/images/temoin-2.jpg";
import temoin3 from "@/assets/images/temoin-3.jpg";

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  avatar: StaticImageData;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "J'ai trouvé une nounou dans mon quartier en trois jours. Le dossier était déjà vérifié, je n'ai eu qu'à fixer la date d'essai.",
    name: "Clarisse M.",
    role: "Employeuse · Bacongo",
    avatar: temoin1,
  },
  {
    quote:
      "Je suis chauffeur depuis douze ans. C'est la première fois qu'une plateforme me met en avant sans me demander une commission sur mon salaire.",
    name: "Serge N.",
    role: "Chauffeur · Poto-Poto",
    avatar: temoin2,
  },
  {
    quote:
      "Le badge Premium a changé les choses : trois familles m'ont contactée la première semaine.",
    name: "Antoinette K.",
    role: "Gouvernante · Pointe-Noire",
    avatar: temoin3,
  },
];

export function Testimonials() {
  return (
    <section className="py-20 sm:py-28 bg-surface bg-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="eyebrow">Ils nous font confiance</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold">
            Des familles, des candidats, des maisons qui tournent.
          </h2>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((testimonial) => (
            <figure
              key={testimonial.name}
              className="relative bg-card rounded-3xl border border-border p-7 shadow-soft flex flex-col"
            >
              <Quote
                aria-hidden
                className="h-8 w-8 text-secondary/30 absolute top-6 right-6"
              />
              <div className="flex items-center gap-1 text-secondary">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-current" />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-[0.975rem] leading-relaxed text-foreground/90">
                « {testimonial.quote} »
              </blockquote>
              <figcaption className="mt-6 pt-6 border-t border-border flex items-center gap-3">
                <Image
                  src={testimonial.avatar}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-cover"
                />
                <span className="text-sm">
                  <span className="block font-semibold">{testimonial.name}</span>
                  <span className="block text-muted-foreground text-xs">
                    {testimonial.role}
                  </span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
