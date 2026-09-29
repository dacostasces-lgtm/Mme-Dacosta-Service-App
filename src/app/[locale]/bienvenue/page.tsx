import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { requireUser, dashboardPathFor } from "@/lib/auth/dal";
import { OnboardingRoleForm } from "@/components/features/auth/OnboardingRoleForm";

export const metadata: Metadata = {
  title: "Bienvenue",
  robots: { index: false, follow: false },
};

/**
 * Dernière étape des comptes créés par un fournisseur externe, qui ne
 * transmet pas de rôle. Les inscriptions au formulaire ne passent jamais ici :
 * leur rôle est horodaté par le déclencheur d'inscription.
 *
 * `allowIncompleteOnboarding` est indispensable : sans lui, la porte posée
 * dans requireUser renverrait cette page vers elle-même sans fin.
 */
export default async function BienvenuePage() {
  const [user, locale] = await Promise.all([
    requireUser({ allowIncompleteOnboarding: true, allowUnverifiedPhone: true }),
    getLocale(),
  ]);

  if (user.onboardingCompletedAt) {
    return redirect({ href: dashboardPathFor(user.role), locale });
  }

  return (
    <div className="flex-1 grid place-items-center bg-surface bg-grain px-4 py-12">
      <div className="w-full max-w-md">
        <p className="text-sm text-muted-foreground mb-2">Dernière étape</p>
        <h1 className="text-3xl font-bold mb-2">Bienvenue, {user.fullName}</h1>
        <p className="text-muted-foreground mb-8">
          Une seule question avant d&apos;entrer : votre compte n&apos;est pas le même
          selon que vous recrutez ou que vous cherchez un emploi.
        </p>

        <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft">
          <OnboardingRoleForm />
        </div>
      </div>
    </div>
  );
}
