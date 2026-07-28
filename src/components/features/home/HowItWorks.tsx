import { Search, MessagesSquare, CalendarCheck } from "lucide-react";

const STEPS = [
  {
    icon: Search,
    title: "Cherchez par quartier",
    text: "Filtrez par métier, disponibilité et rayon autour de vous. Les profils les plus proches remontent en premier.",
  },
  {
    icon: MessagesSquare,
    title: "Échangez directement",
    text: "Consultez le dossier vérifié, puis discutez avec le candidat via la messagerie de la plateforme.",
  },
  {
    icon: CalendarCheck,
    title: "Réservez un essai",
    text: "Fixez une date d'essai en quelques clics et confirmez l'embauche une fois convaincu.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 sm:py-28 bg-surface bg-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="eyebrow">Comment ça marche</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold">
            Trois étapes, pas une de plus.
          </h2>
        </div>

        <ol className="mt-14 grid md:grid-cols-3 gap-8 md:gap-6 relative">
          {/* Connector sits behind the numbered discs on desktop only. */}
          <div
            aria-hidden
            className="hidden md:block absolute top-7 left-[16.66%] right-[16.66%] h-px bg-gradient-to-r from-transparent via-border to-transparent"
          />

          {STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <div className="flex md:block items-center gap-4">
                <span className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-card border border-border shadow-soft text-primary">
                  <step.icon className="h-6 w-6" />
                  <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-secondary text-secondary-foreground text-xs font-bold grid place-items-center">
                    {index + 1}
                  </span>
                </span>
                <h3 className="md:mt-6 text-xl font-bold">{step.title}</h3>
              </div>
              <p className="mt-3 text-muted-foreground leading-relaxed">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
