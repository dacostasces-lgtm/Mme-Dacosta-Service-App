"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { Link, useRouter } from "@/i18n/routing";

const schema = z
  .object({
    password: z.string().min(8, "Au moins 8 caractères"),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirm"],
  });

type FormData = z.infer<typeof schema>;

/** Rendered only when the recovery link has already opened a session — the page
 *  checks that before mounting this. */
export function ResetPasswordForm({ dashboardPath }: { dashboardPath: string }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = async (data: FormData) => {
    setSubmitError("");

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });

    if (error) {
      setSubmitError(
        error.message.includes("should be different")
          ? "Choisissez un mot de passe différent de l'ancien."
          : `Modification impossible : ${error.message}`
      );
      return;
    }

    router.push(dashboardPath);
    router.refresh();
  };

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-card rounded-2xl shadow-xl shadow-primary/5">
      <KeyRound className="h-10 w-10 text-primary mb-4" />
      <h1 className="text-2xl font-bold mb-2">Nouveau mot de passe</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Choisissez un mot de passe d&apos;au moins 8 caractères. Vous resterez connecté ensuite.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label htmlFor="password" className="text-sm font-medium mb-1 block">
            Nouveau mot de passe
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p className="text-sm text-destructive mt-1">
              {form.formState.errors.password.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirm" className="text-sm font-medium mb-1 block">
            Confirmez le mot de passe
          </label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            {...form.register("confirm")}
          />
          {form.formState.errors.confirm && (
            <p className="text-sm text-destructive mt-1">{form.formState.errors.confirm.message}</p>
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
          Enregistrer le mot de passe
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
