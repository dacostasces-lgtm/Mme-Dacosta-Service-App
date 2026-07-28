import { getLocale } from "next-intl/server";
import { LoginForm } from "@/components/features/auth/LoginForm";
import { AuthShell } from "@/components/shared/AuthShell";
import { redirect } from "@/i18n/routing";
import { getCurrentUser, dashboardPathFor } from "@/lib/auth/dal";
import illustration from "@/assets/images/metier-gouvernante.jpg";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, user, locale] = await Promise.all([
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
      <LoginForm initialError={error} />
    </AuthShell>
  );
}
