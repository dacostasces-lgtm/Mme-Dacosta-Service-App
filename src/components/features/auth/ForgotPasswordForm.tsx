"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/routing";
import { PhoneRecoveryForm } from "@/components/features/auth/PhoneRecoveryForm";

const schema = z.object({
  email: z.string().email("Email invalide"),
});

type FormData = z.infer<typeof schema>;

const CARTE = "w-full max-w-md mx-auto p-8 bg-card rounded-2xl shadow-xl shadow-primary/5";

function RetourConnexion() {
  return (
    <p className="text-sm text-muted-foreground text-center mt-6">
      <Link href="/login" className="text-primary font-medium hover:underline">
        Retour à la connexion
      </Link>
    </p>
  );
}

/** Voie historique : Supabase envoie un lien de réinitialisation. */
function ParEmail() {
  const locale = useLocale();
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: FormData) => {
    setSubmitError("");

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setSubmitError("Configuration Supabase manquante.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/auth/confirm?locale=${locale}&next=/mot-de-passe`,
    });

    // Shown as sent either way: telling the visitor that an address is unknown
    // turns this form into a way to find out who has an account here.
    if (error && !error.message.toLowerCase().includes("user not found")) {
      setSubmitError(`Envoi impossible : ${error.message}`);
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="h-12 w-12 text-primary mx-auto mb-4" />
        <p className="font-semibold text-lg mb-2">Vérifiez votre boîte mail</p>
        <p className="text-muted-foreground text-sm">
          Si un compte existe avec cette adresse, vous recevrez un lien pour choisir un
          nouveau mot de passe. Le lien expire au bout d&apos;une heure.
        </p>
        <RetourConnexion />
      </div>
    );
  }

  return (
    <>
      <p className="text-muted-foreground text-sm mb-6">
        Indiquez l&apos;adresse email de votre compte. Nous vous enverrons un lien pour en
        choisir un nouveau.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label htmlFor="email" className="text-sm font-medium mb-1 block">
            Email
          </label>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
          {form.formState.errors.email && (
            <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>
          )}
        </div>

        {submitError && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{submitError}</p>
        )}

        <Button
          type="submit"
          className="w-full h-12 text-base font-semibold rounded-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Envoyer le lien
        </Button>
      </form>

      <RetourConnexion />
    </>
  );
}

/**
 * Deux voies de récupération, parce qu'un compte peut n'avoir que l'une des
 * deux : depuis que l'inscription accepte un numéro seul, la voie email
 * laisserait ces comptes définitivement enfermés dehors.
 *
 * Le SMS est proposé en premier, comme à l'inscription.
 */
export function ForgotPasswordForm() {
  const [voie, setVoie] = useState<"phone" | "email">("phone");

  return (
    <div className={CARTE}>
      <h1 className="text-2xl font-bold mb-2">Mot de passe oublié</h1>

      <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-surface border border-border my-5">
        {(
          [
            ["phone", "Par SMS"],
            ["email", "Par email"],
          ] as const
        ).map(([valeur, libelle]) => (
          <button
            key={valeur}
            type="button"
            onClick={() => setVoie(valeur)}
            aria-pressed={voie === valeur}
            className={`h-10 rounded-full text-sm font-medium transition-colors ${
              voie === valeur
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {voie === "phone" ? (
        <>
          <p className="text-muted-foreground text-sm mb-6">
            Indiquez le numéro de votre compte. Un code vous sera envoyé pour choisir un
            nouveau mot de passe.
          </p>
          <PhoneRecoveryForm />
          <RetourConnexion />
        </>
      ) : (
        <ParEmail />
      )}
    </div>
  );
}
