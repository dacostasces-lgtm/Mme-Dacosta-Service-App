import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/routing";
import { requireUser, dashboardPathFor } from "@/lib/auth/dal";
import { getLocations } from "@/lib/geo/locations";
import { CompleteAccountForm } from "@/components/features/auth/CompleteAccountForm";

export const metadata: Metadata = {
  title: "Complétez votre compte",
  robots: { index: false, follow: false },
};

/**
 * L'étape imposée à un employeur à qui il manque son numéro ou son quartier,
 * avant d'entrer dans son espace (demandé le 27 novembre 2026). Elle concerne
 * les comptes inscrits avant que le formulaire les exige : un bandeau les
 * leur réclamait, sans rien empêcher.
 *
 * `allowIncompleteAccount` est indispensable : sans lui, la porte posée dans
 * requireUser renverrait cette page vers elle-même sans fin.
 * `allowUnverifiedPhone` aussi : la vérification du numéro vient après, une
 * fois qu'il y en a un.
 */
export default async function CoordonneesPage() {
  const [user, locale, cities] = await Promise.all([
    requireUser({ allowIncompleteAccount: true, allowUnverifiedPhone: true }),
    getLocale(),
    getLocations(),
  ]);

  if (user.role !== "employer" || user.missingProfileFields.length === 0) {
    return redirect({ href: dashboardPathFor(user.role), locale });
  }

  const needsPhone = !user.hasPhone;
  const needsNeighborhood = !user.hasNeighborhood;

  return (
    <div className="flex-1 grid place-items-center bg-surface bg-grain px-4 py-12">
      <div className="w-full max-w-md">
        <p className="text-sm text-muted-foreground mb-2">Une dernière étape</p>
        <h1 className="text-3xl font-bold mb-2">Complétez votre compte</h1>
        <p className="text-muted-foreground mb-8">
          {needsPhone && needsNeighborhood
            ? "Votre numéro et votre quartier sont désormais obligatoires. C'est par votre numéro que les candidats et notre équipe vous joignent."
            : needsPhone
              ? "Votre numéro est désormais obligatoire : c'est par lui que les candidats et notre équipe vous joignent."
              : "Votre quartier est désormais obligatoire : notre équipe ne valide un compte qu'une fois qu'il est renseigné."}
        </p>

        <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft">
          <CompleteAccountForm
            needsPhone={needsPhone}
            needsNeighborhood={needsNeighborhood}
            cities={cities}
          />
        </div>

        {/* La porte ne doit enfermer personne : la suppression du compte reste
            ouverte depuis le profil. */}
        <p className="text-xs text-muted-foreground text-center mt-6">
          Vous ne souhaitez plus utiliser Madame Dacosta Services ?{" "}
          <Link
            href="/profil#supprimer-mon-compte"
            className="font-medium text-primary hover:underline"
          >
            Supprimer mon compte
          </Link>
        </p>
      </div>
    </div>
  );
}
