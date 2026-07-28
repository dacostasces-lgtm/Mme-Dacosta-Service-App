import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ResetPasswordForm } from "@/components/features/auth/ResetPasswordForm";
import { AuthShell } from "@/components/shared/AuthShell";
import { redirect } from "@/i18n/routing";
import { getCurrentUser, dashboardPathFor } from "@/lib/auth/dal";
import illustration from "@/assets/images/metier-linge.jpg";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  // The recovery link is what creates the session; landing here without one
  // means the link expired, was already used, or the page was opened directly.
  if (!user) {
    return redirect({
      href: {
        pathname: "/login",
        query: {
          error:
            "Ce lien de réinitialisation n'est plus valide. Demandez-en un nouveau.",
        },
      },
      locale,
    });
  }

  return (
    <AuthShell
      image={illustration}
      imageAlt="Du linge repassé et plié avec soin"
      quote="Un compte perdu ne doit jamais coûter un emploi."
      author="Madame Dacosta Services"
    >
      {/* Locale-less on purpose: the form pushes it through next-intl's router,
          which adds the prefix itself. */}
      <ResetPasswordForm dashboardPath={dashboardPathFor(user.role)} />
    </AuthShell>
  );
}
