import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { requireUser, dashboardPathFor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { isOtpConfigured } from "@/lib/otp/infobip";
import { VerificationStep } from "@/components/features/auth/VerificationStep";

export const metadata: Metadata = {
  title: "Vérification de votre numéro",
  robots: { index: false, follow: false },
};

/**
 * Étape franchie juste après l'inscription, avant d'atteindre son espace.
 *
 * `allowUnverifiedPhone` est indispensable : sans lui, la porte posée dans
 * requireUser renverrait cette page vers elle-même sans fin.
 */
export default async function VerificationPage() {
  const [user, locale] = await Promise.all([
    requireUser({ allowUnverifiedPhone: true }),
    getLocale(),
  ]);

  // Rien à faire ici dans trois cas : déjà vérifié, vérification indisponible,
  // ou compte sans numéro — celui créé avec une adresse email seule, qu'il
  // serait absurde d'arrêter pour confirmer un numéro qu'il n'a pas.
  if (user.phoneVerifiedAt || !user.hasPhone || !isOtpConfigured()) {
    return redirect({ href: dashboardPathFor(user.role), locale });
  }

  // Le numéro n'est lisible que par cette fonction : la colonne est révoquée.
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_contact");
  const phone = ((data ?? [])[0]?.phone as string | undefined) ?? null;

  return (
    <div className="flex-1 grid place-items-center bg-surface bg-grain px-4 py-12">
      <div className="w-full max-w-md">
        <p className="text-sm text-muted-foreground mb-2">Dernière étape</p>
        <h1 className="text-3xl font-bold mb-2">Vérifions votre numéro</h1>
        <p className="text-muted-foreground mb-8">
          C&apos;est par ce numéro qu&apos;un employeur vous joindra. Une seule faute de
          frappe et l&apos;appel n&apos;arrive jamais.
        </p>

        <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-soft">
          <VerificationStep
            phone={phone}
            dashboardPath={dashboardPathFor(user.role)}
          />
        </div>
      </div>
    </div>
  );
}
