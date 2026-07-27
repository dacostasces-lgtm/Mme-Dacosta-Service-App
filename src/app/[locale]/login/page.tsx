import { getLocale } from "next-intl/server";
import { LoginForm } from "@/components/features/auth/LoginForm";
import { redirect } from "@/i18n/routing";
import { getCurrentUser, dashboardPathFor } from "@/lib/auth/dal";

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
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <LoginForm initialError={error} />
    </div>
  );
}
