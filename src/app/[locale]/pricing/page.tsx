import { Check, Minus } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

// Placeholder amounts in XAF, gathered here so they can be changed in one place
// once the commercial terms are settled. `subscriptions.currency` defaults to
// XAF, the Central African CFA franc used in Congo-Brazzaville.
const PLANS = [
  {
    name: "Gratuit",
    price: 0,
    tagline: "Pour commencer et se faire connaître",
    audience: "Candidats et employeurs",
    features: [
      { label: "Profil visible après vérification", included: true },
      { label: "Recherche par proximité", included: true },
      { label: "Messagerie avec vos contacts", included: true },
      { label: "Mise en avant dans les résultats", included: false },
      { label: "Badge Premium sur votre profil", included: false },
    ],
  },
  {
    name: "Premium Candidat",
    price: 5000,
    tagline: "Pour être vu en premier",
    audience: "Candidats",
    highlighted: true,
    features: [
      { label: "Tout ce qui est inclus dans Gratuit", included: true },
      { label: "Mise en avant dans les résultats", included: true },
      { label: "Badge Premium sur votre profil", included: true },
      { label: "Candidatures illimitées aux offres", included: true },
      { label: "Statistiques de vues du profil", included: true },
    ],
  },
  {
    name: "Premium Employeur",
    price: 25000,
    tagline: "Pour recruter sans attendre",
    audience: "Employeurs et agences",
    features: [
      { label: "Offres d'emploi illimitées", included: true },
      { label: "Vos offres mises en avant", included: true },
      { label: "Coordonnées des candidats vérifiés", included: true },
      { label: "Garantie de remplacement 30 jours", included: true },
      { label: "Accompagnement au recrutement", included: true },
    ],
  },
];

function formatPrice(price: number) {
  if (price === 0) return "Gratuit";
  return `${new Intl.NumberFormat("fr-FR").format(price)} FCFA`;
}

export default async function PricingPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex-1 bg-surface bg-mesh bg-grain py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <span className="eyebrow">Tarifs</span>
          <h1 className="mt-4 text-4xl sm:text-5xl font-bold">Des tarifs simples</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Créer un compte et consulter les profils est gratuit. Le premium sert à être vu en
            priorité, que vous cherchiez un emploi ou du personnel de maison.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-card rounded-3xl p-8 border flex flex-col h-full ${
                plan.highlighted
                  ? "border-secondary/60 ring-1 ring-secondary/40 shadow-lift md:-translate-y-4"
                  : "border-border shadow-soft"
              }`}
            >
              {plan.highlighted && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 -top-px h-1 rounded-t-3xl bg-gradient-to-r from-transparent via-secondary to-transparent"
                />
              )}
              {plan.highlighted && (
                <span className="self-start text-xs font-semibold px-3 py-1 rounded-full bg-secondary text-secondary-foreground mb-4">
                  Le plus choisi
                </span>
              )}

              <h2 className="text-xl font-bold">{plan.name}</h2>
              <p className="text-sm text-muted-foreground mb-1">{plan.tagline}</p>
              <p className="text-xs text-muted-foreground mb-6">{plan.audience}</p>

              <div className="mb-8">
                <span className="font-display text-4xl font-bold text-primary">
                  {formatPrice(plan.price)}
                </span>
                {plan.price > 0 && <span className="text-muted-foreground"> / mois</span>}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li
                    key={feature.label}
                    className={`flex items-start gap-2 text-sm ${
                      feature.included ? "" : "text-muted-foreground/60"
                    }`}
                  >
                    {feature.included ? (
                      <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <Minus className="h-4 w-4 shrink-0 mt-0.5" />
                    )}
                    {feature.label}
                  </li>
                ))}
              </ul>

              <Link
                href={user ? "/dashboard/employer" : "/register"}
                // cn() rather than buttonVariants({ className }) so the border
                // override actually replaces the variant's own border colour.
                className={cn(
                  buttonVariants({ variant: plan.highlighted ? "default" : "outline" }),
                  "w-full h-11 rounded-full",
                  !plan.highlighted &&
                    "border-2 border-primary/30 text-primary hover:bg-accent hover:text-primary"
                )}
              >
                {plan.price === 0 ? "Créer un compte" : "Choisir cette offre"}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-12">
          Paiement par MTN MoMo ou Airtel Money. Résiliable à tout moment, sans engagement.
        </p>
      </div>
    </div>
  );
}
