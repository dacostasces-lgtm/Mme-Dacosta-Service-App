import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/features/auth/ForgotPasswordForm";
import { AuthShell } from "@/components/shared/AuthShell";
import illustration from "@/assets/images/metier-linge.jpg";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      image={illustration}
      imageAlt="Du linge repassé et plié avec soin"
      quote="Un compte perdu ne doit jamais coûter un emploi."
      author="Madame Dacosta Services"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
