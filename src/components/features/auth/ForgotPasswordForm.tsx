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

const schema = z.object({
  email: z.string().email("Email invalide"),
});

type FormData = z.infer<typeof schema>;

export function ForgotPasswordForm() {
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
      <div className="w-full max-w-md mx-auto p-8 bg-card rounded-2xl shadow-xl shadow-primary/5 text-center">
        <MailCheck className="h-12 w-12 text-primary mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Vérifiez votre boîte mail</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Si un compte existe avec cette adresse, vous recevrez un lien pour choisir un nouveau
          mot de passe. Le lien expire au bout d&apos;une heure.
        </p>
        <Link href="/login" className="text-sm text-primary font-medium hover:underline">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-card rounded-2xl shadow-xl shadow-primary/5">
      <h1 className="text-2xl font-bold mb-2">Mot de passe oublié</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Indiquez l&apos;adresse email de votre compte. Nous vous enverrons un lien pour en choisir
        un nouveau.
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
          className="w-full h-12 text-base font-semibold"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Envoyer le lien
        </Button>
      </form>

      <p className="text-sm text-muted-foreground text-center mt-6">
        <Link href="/login" className="text-primary font-medium hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
