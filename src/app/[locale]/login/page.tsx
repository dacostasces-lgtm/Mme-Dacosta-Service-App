import { getLocale } from "next-intl/server";
import { LoginForm } from "@/components/features/auth/LoginForm";
import { messageConnexion } from "@/lib/auth/messages-connexion";
import { AuthShell } from "@/components/shared/AuthShell";
import { redirect } from "@/i18n/routing";
import { getCurrentUser, dashboardPathFor } from "@/lib/auth/dal";
import illustration from "@/assets/images/metier-gouvernante.jpg";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; confirme?: string }>;
}) {
  const [{ error, confirme }, user, locale] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getLocale(),
  ]);

  if (user) {
    redirect({ href: dashboardPathFor(user.role), locale });
  }

  return (
    <AuthShell
      image={illustration}
      imageAlt="Une gouvernante range les placards d'une cuisine"
      quote="Une maison bien tenue, c'est d'abord quelqu'un en qui on a confiance."
      author="Madame Dacosta Services"
    >
      {/* Jamais le paramètre brut : seul un code connu donne un message. */}
      <LoginForm
        initialError={messageConnexion(error)}
        initialNotice={confirme === "1" ? messageConnexion("compte_confirme") : undefined}
      />
    </AuthShell>
  );
}
