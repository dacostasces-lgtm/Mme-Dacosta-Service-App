import { getLocale } from "next-intl/server";
import { RegisterForm } from "@/components/features/auth/RegisterForm";
import { AuthShell } from "@/components/shared/AuthShell";
import { redirect } from "@/i18n/routing";
import { getCurrentUser, dashboardPathFor } from "@/lib/auth/dal";
import illustration from "@/assets/images/metier-nounou.jpg";

export default async function RegisterPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  if (user) {
    redirect({ href: dashboardPathFor(user.role), locale });
  }

  return (
    <AuthShell
      image={illustration}
      imageAlt="Une nounou porte un bébé dans ses bras"
      quote="Employeurs et candidats sur la même plateforme, sans commission sur le salaire."
      author="Madame Dacosta Services"
    >
      <RegisterForm />
    </AuthShell>
  );
}
