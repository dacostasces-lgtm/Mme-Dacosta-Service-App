"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { dashboardPathFor, type UserRole } from "@/lib/auth/roles";
import { Link, useRouter } from "@/i18n/routing";

const schema = z.object({
  email: z.string().email("Email invalide"),
  // No length rule on sign-in: the minimum belongs at signup, and enforcing the
  // current one here would lock out accounts created under the old 6-character
  // rule with a validation error instead of letting them log in and change it.
  password: z.string().min(1, "Saisissez votre mot de passe"),
});

type FormData = z.infer<typeof schema>;

export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState(initialError ?? "");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: FormData) => {
    setSubmitError("");

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setSubmitError("Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
      return;
    }

    const supabase = createClient();
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setSubmitError(
        error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : error.message === "Email not confirmed"
            ? "Veuillez confirmer votre email avant de vous connecter."
            : `Erreur lors de la connexion : ${error.message}`
      );
      return;
    }

    // `profiles.role` is the authority everywhere else in the app; signup
    // metadata is only a fallback for the moment before the trigger has written
    // the row. Reading metadata here is what sent admins — whose role is set in
    // the table, never at signup — to the employer dashboard.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", signInData.user.id)
      .maybeSingle();

    const role = (profile?.role ??
      signInData.user?.user_metadata?.role ??
      "candidate") as UserRole;

    router.push(dashboardPathFor(role));
    router.refresh();
  };

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-card rounded-2xl shadow-xl shadow-primary/5">
      <h2 className="text-3xl font-bold text-center mb-8 text-primary">Connexion</h2>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Email</label>
          <Input type="email" placeholder="email@exemple.com" {...form.register("email")} />
          {form.formState.errors.email && <p className="text-xs text-destructive mt-1">{form.formState.errors.email.message}</p>}
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-sm font-medium">Mot de passe</label>
            <Link
              href="/mot-de-passe-oublie"
              className="text-xs text-primary font-medium hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <Input type="password" placeholder="••••••••" {...form.register("password")} />
          {form.formState.errors.password && <p className="text-xs text-destructive mt-1">{form.formState.errors.password.message}</p>}
        </div>

        {submitError && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{submitError}</p>
        )}

        <Button type="submit" className="w-full h-12 mt-4 text-base font-semibold" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {form.formState.isSubmitting ? "Connexion..." : "Se connecter"}
        </Button>
      </form>

      <p className="text-sm text-center text-muted-foreground mt-6">
        Pas encore de compte ?{" "}
        <Link href="/register" className="text-primary font-medium hover:underline">
          S&apos;inscrire
        </Link>
      </p>
    </div>
  );
}
