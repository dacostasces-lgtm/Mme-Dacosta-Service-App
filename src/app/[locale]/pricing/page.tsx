import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/dal";
import { ChoosePlanButton } from "@/components/features/subscriptions/ChoosePlanButton";
import { PLANS as PRICES, formatPrice, type PlanId } from "@/lib/subscriptions/plans";
import { CANDIDATE_UNLOCK_PRICE, UNLOCK_PRICE, whatsappLink } from "@/lib/contact/unlock";
import { JOB_PRICE } from "@/lib/jobs/payment";
import { WHATSAPP_NUMBER } from "@/lib/payments/manual";
import { cn } from "@/lib/utils";

/**
 * La page était rangée selon notre façon de facturer — trois cartes
 * d'abonnement, puis une liste « sans abonnement » — alors que le visiteur
 * arrive avec une seule question : je recrute, ou je cherche du travail ? Il
 * devait trier six offres réparties dans deux mises en page, avec des prix
 * répétés une seconde fois entre parenthèses dans une liste de coches barrées.
 *
 * Elle répond donc d'abord à cette question, puis ne montre à chacun que ses
 * lignes, du moins engageant au plus : une fois, puis par mois. Les montants
 * s'alignent tous à droite, à la même place, pour que la colonne se parcoure
 * d'un seul coup d'œil.
 *
 * Les prix viennent des modules qui facturent réellement. Les recopier ici les
 * avait déjà fait diverger, et chaque ligne doit correspondre à une fonction
 * qui existe : une promesse sans rien derrière se paie au premier client.
 */

type Ligne = {
  /** Ce que la personne veut faire, dans ses mots à elle. */
  titre: string;
  prix: number;
  /** Les abonnements seuls portent une périodicité. */
  parMois?: boolean;
  detail: string;
  /** Présent quand la ligne s'achète ici même. */
  plan?: PlanId;
};

type Cote = {
  question: string;
  lignes: Ligne[];
};

const COTES: Cote[] = [
  {
    question: "Je recrute",
    lignes: [
      {
        titre: "Le numéro d'un candidat",
        prix: CANDIDATE_UNLOCK_PRICE,
        detail: "Depuis sa fiche. Le numéro y reste affiché ensuite.",
      },
      {
        titre: "Publier une offre",
        prix: JOB_PRICE,
        detail:
          "Le numéro de tous les candidats qui y postulent, pendant toute la durée de l'offre.",
      },
      {
        titre: "Premium Employeur",
        prix: PRICES.premium_employer.price,
        parMois: true,
        plan: "premium_employer",
        detail:
          "Le numéro de tous les candidats, et toutes vos offres incluses. Pour plusieurs postes à pourvoir.",
      },
    ],
  },
  {
    question: "Je cherche un emploi",
    lignes: [
      {
        titre: "Le numéro d'un employeur",
        prix: UNLOCK_PRICE,
        detail: "Depuis la page de son offre. Le numéro reste dans votre tableau de bord.",
      },
      {
        titre: "Premium Candidat",
        prix: PRICES.premium_candidate.price,
        parMois: true,
        plan: "premium_candidate",
        // La gratuité de son propre numéro est annoncée parce qu'elle existe
        // depuis 20261031100000 : tout recruteur le voit sans payer. Avant
        // cette migration, la phrase aurait promis ce que personne n'obtenait.
        detail:
          "Votre numéro visible gratuitement par tous les recruteurs, le numéro de tous les employeurs, et votre profil mis en avant.",
      },
    ],
  },
];

export default async function PricingPage() {
  const user = await getCurrentUser();

  // Sans numéro configuré, le lien n'est pas affiché plutôt que de pointer
  // dans le vide : même règle que pour les numéros Mobile Money.
  const devisLink = WHATSAPP_NUMBER
    ? whatsappLink(
        WHATSAPP_NUMBER,
        "Bonjour, je souhaite confier le placement et la gestion de mon personnel à Madame Dacosta Services."
      )
    : null;

  return (
    <div className="flex-1 bg-surface bg-mesh bg-grain py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="text-center mb-14 max-w-xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold">Des tarifs simples</h1>
          {/* Le gratuit se dit une fois, ici, plutôt que dans une carte dont la
              moitié des lignes étaient barrées. C'est la phrase qui répond à la
              question que tout le monde se pose en arrivant. */}
          <p className="mt-5 text-lg text-muted-foreground">
            Créer un compte, publier, chercher et échanger par la messagerie est gratuit. Vous
            ne payez qu&apos;au moment d&apos;obtenir un numéro de téléphone.
          </p>
          {!user && (
            <Link
              href="/register"
              className={cn(buttonVariants(), "mt-7 h-12 rounded-full px-8")}
            >
              Créer un compte gratuitement
            </Link>
          )}
        </header>

        <div className="grid gap-6 md:grid-cols-2 items-start">
          {COTES.map((cote) => (
            <section
              key={cote.question}
              className="bg-card border border-border rounded-3xl shadow-soft overflow-hidden"
            >
              <h2 className="font-display text-2xl font-bold px-6 pt-6 pb-5">{cote.question}</h2>

              <ul className="divide-y divide-border border-t border-border">
                {cote.lignes.map((ligne) => (
                  <li key={ligne.titre} className="p-6">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="font-semibold">{ligne.titre}</h3>
                      <p className="font-display text-xl font-bold text-primary shrink-0 tabular-nums">
                        {formatPrice(ligne.prix)}
                        {ligne.parMois && (
                          <span className="text-sm font-normal text-muted-foreground">
                            {" "}
                            / mois
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1.5">{ligne.detail}</p>

                    {ligne.plan &&
                      (user ? (
                        <div className="mt-4">
                          <ChoosePlanButton planId={ligne.plan} />
                        </div>
                      ) : (
                        <Link
                          // Un abonnement se rattache à un profil : sans compte,
                          // il n'y a rien à quoi l'attacher.
                          href="/register"
                          className={cn(
                            buttonVariants({ variant: "outline" }),
                            "mt-4 w-full h-11 rounded-full border-2 border-primary/30 text-primary hover:bg-accent hover:text-primary"
                          )}
                        >
                          Choisir cette offre
                        </Link>
                      ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Hors des deux colonnes : cette prestation ne s'achète pas en ligne et
            ne concerne ni le même besoin ni le même interlocuteur. */}
        <section className="mt-6 bg-card border border-border rounded-3xl shadow-soft p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-semibold">Confier votre personnel à l&apos;agence</h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              Placement et gestion : vous nous confiez votre besoin, nous vous adressons une
              proposition adaptée.
            </p>
          </div>
          {devisLink ? (
            <a
              href={devisLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-11 rounded-full px-6 border-2 border-primary/30 text-primary hover:bg-accent hover:text-primary shrink-0"
              )}
            >
              Demander un devis
            </a>
          ) : (
            <p className="font-display text-xl font-bold text-primary shrink-0">Sur devis</p>
          )}
        </section>

        <p className="text-center text-sm text-muted-foreground mt-10 max-w-xl mx-auto">
          Paiement par MTN MoMo ou Airtel Money, vérifié par notre équipe. Les abonnements durent
          un mois et ne se renouvellent pas d&apos;eux-mêmes.
        </p>
      </div>
    </div>
  );
}
