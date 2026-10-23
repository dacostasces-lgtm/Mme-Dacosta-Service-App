import { Check, Minus } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/dal";
import { ChoosePlanButton } from "@/components/features/subscriptions/ChoosePlanButton";
import { PLANS as PRICES, formatPrice, type PlanId } from "@/lib/subscriptions/plans";
import { CANDIDATE_UNLOCK_PRICE, UNLOCK_PRICE } from "@/lib/contact/unlock";
import { JOB_PRICE } from "@/lib/jobs/payment";
import { cn } from "@/lib/utils";

// Les montants viennent des fichiers qui servent à facturer (plans.ts,
// unlock.ts, payment.ts, bookings/constants.ts) : les recopier ici les avait
// déjà fait diverger. Chaque fonctionnalité listée doit exister dans
// l'application — les promesses sans fonction derrière ont été retirées.
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
      { label: "Publier des offres et recevoir des candidatures", included: true },
      {
        label: `Numéro des candidats (${formatPrice(JOB_PRICE)} par offre, ou ${formatPrice(CANDIDATE_UNLOCK_PRICE)} l'unité)`,
        included: false,
      },
      { label: `Numéro des employeurs (${formatPrice(UNLOCK_PRICE)} par offre)`, included: false },
      { label: "Mise en avant dans les résultats", included: false },
      { label: "Badge Premium sur votre profil", included: false },
    ],
  },
  {
    name: "Premium Candidat",
    // Ties the card to lib/subscriptions/plans.ts, which is where the price
    // that actually gets charged lives.
    id: "premium_candidate" as PlanId,
    price: PRICES.premium_candidate.price,
    tagline: "Pour être vu en premier",
    audience: "Candidats",
    highlighted: true,
    features: [
      { label: "Tout ce qui est inclus dans Gratuit", included: true },
      { label: "Le numéro de téléphone de tous les employeurs", included: true },
      { label: "Mise en avant dans les résultats", included: true },
      { label: "Badge Premium sur votre profil", included: true },
    ],
  },
  {
    name: "Premium Employeur",
    id: "premium_employer" as PlanId,
    price: PRICES.premium_employer.price,
    tagline: "Pour recruter sans attendre",
    audience: "Employeurs et agences",
    features: [
      { label: "Le numéro de tous les candidats, sur leur fiche et sur vos offres", included: true },
      { label: "Toutes vos offres en formule payante, sans supplément", included: true },
      { label: "Badge Premium sur vos offres", included: true },
    ],
  },
];

/** Ce qui se paie une fois, sans abonnement. */
const ONE_OFF = [
  {
    label: "Numéro d'un employeur",
    audience: "Candidat",
    price: UNLOCK_PRICE,
    detail: "Pour une offre, depuis sa page. Le numéro reste dans votre tableau de bord.",
  },
  {
    label: "Numéro d'un candidat",
    audience: "Employeur",
    price: CANDIDATE_UNLOCK_PRICE,
    detail: "Depuis la fiche du candidat. Le numéro reste ensuite affiché sur sa fiche.",
  },
  {
    label: "Offre payante",
    audience: "Employeur",
    price: JOB_PRICE,
    detail: "Le numéro de chaque candidat qui postule à cette offre, pour toute sa durée.",
  },
  // La réservation à 15 000 FCFA a été retirée : elle facturait une mise en
  // relation que le déblocage de numéro facture 500, soit trente fois moins
  // pour le même service.
  {
    label: "Placement et gestion de personnel",
    audience: "Employeur",
    // Pas de montant : la prestation se chiffre au cas par cas, et afficher un
    // prix d'appel ici obligerait à le démentir au premier échange.
    price: null,
    detail:
      "Vous nous confiez votre besoin, nous vous adressons une proposition adaptée.",
  },
];

export default async function PricingPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex-1 bg-surface bg-mesh bg-grain py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <span className="eyebrow">Tarifs</span>
          <h1 className="mt-4 text-4xl sm:text-5xl font-bold">Des tarifs simples</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Créer un compte, consulter les profils et échanger par la messagerie est gratuit.
            Le paiement sert à obtenir les numéros de téléphone et à être vu en priorité —
            par abonnement, ou une seule fois.
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

              {plan.id && user ? (
                <ChoosePlanButton planId={plan.id} highlighted={plan.highlighted} />
              ) : (
                <Link
                  // Signed-out visitors register first: a subscription is tied
                  // to a profile, so there is nothing to attach one to yet.
                  href={plan.id ? "/register" : user ? "/profil" : "/register"}
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
              )}
            </div>
          ))}
        </div>

        <section className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-2">Sans abonnement</h2>
          <p className="text-center text-muted-foreground mb-6">
            Payez seulement ce dont vous avez besoin, une fois.
          </p>
          <ul className="divide-y divide-border rounded-3xl border border-border bg-card shadow-soft">
            {ONE_OFF.map((item) => (
              <li key={item.label} className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {item.label}{" "}
                    <span className="text-xs font-normal text-muted-foreground">· {item.audience}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                </div>
                <p className="font-display text-xl font-bold text-primary shrink-0">
                  {/* `null` vaut « sur devis » : la prestation de placement se
                      chiffre au cas par cas. Afficher 0 FCFA la ferait passer
                      pour gratuite. */}
                  {item.price === null ? "Sur devis" : formatPrice(item.price)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-center text-sm text-muted-foreground mt-10">
          Paiement par MTN MoMo ou Airtel Money, vérifié par notre équipe. Les abonnements durent
          un mois et ne se renouvellent pas d&apos;eux-mêmes.
        </p>
      </div>
    </div>
  );
}
