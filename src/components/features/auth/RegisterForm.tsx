"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { MapPin, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Link, useRouter } from "@/i18n/routing";

const schema = z.object({
  fullName: z.string().min(2, "Requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Au moins 6 caractères"),
  role: z.enum(["employer", "candidate"]),
  country: z.string().min(1, "Requis"),
  city: z.string().min(1, "Requis"),
  neighborhood: z.string().min(1, "Requis"),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

type FormData = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const locale = useLocale();
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: "employer",
      fullName: "",
      country: "",
      city: "",
      neighborhood: "",
    },
  });

  const requestGPS = () => {
    setGpsLoading(true);
    setGpsError("");
    
    if (!navigator.geolocation) {
      setGpsError("La géolocalisation n'est pas supportée par votre navigateur.");
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        form.setValue("lat", latitude);
        form.setValue("lng", longitude);
        
        try {
          // Simulation of Reverse Geocoding (e.g. OpenStreetMap Nominatim)
          // In a real implementation, call an API Route to keep keys secret.
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          
          if (data && data.address) {
            form.setValue("country", data.address.country || "Congo-Brazzaville");
            form.setValue("city", data.address.city || data.address.town || data.address.village || "Brazzaville");
            form.setValue("neighborhood", data.address.suburb || data.address.neighbourhood || "");
          }
        } catch {
          setGpsError("Erreur lors de la récupération de l'adresse.");
        } finally {
          setGpsLoading(false);
        }
      },
      () => {
        setGpsError("Permission refusée. Veuillez entrer votre adresse manuellement.");
        setGpsLoading(false);
      }
    );
  };

  const onSubmit = async (data: FormData) => {
    setSubmitError("");

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setSubmitError("Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
      return;
    }

    const supabase = createClient();
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        // Sends the confirmation link to our own handler, which exchanges the
        // token and forwards to the right dashboard in the user's language.
        emailRedirectTo: `${window.location.origin}/auth/confirm?locale=${locale}`,
        data: {
          role: data.role,
          full_name: data.fullName,
          country: data.country,
          city: data.city,
          neighborhood: data.neighborhood,
          lat: data.lat,
          lng: data.lng,
        },
      },
    });

    if (error) {
      setSubmitError(
        error.message === "User already registered"
          ? "Un compte existe déjà avec cet email."
          : `Erreur lors de l'inscription : ${error.message}`
      );
      return;
    }

    if (signUpData.session) {
      router.push(data.role === "employer" ? "/dashboard/employer" : "/dashboard/candidate");
      router.refresh();
    } else {
      // Email confirmation is enabled on the project: no session until the link is clicked.
      setAwaitingConfirmation(true);
    }
  };

  if (awaitingConfirmation) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-card rounded-2xl shadow-xl shadow-primary/5 text-center">
        <MailCheck className="h-12 w-12 mx-auto text-primary mb-4" />
        <h2 className="text-2xl font-bold mb-2 text-primary">Vérifiez votre boîte mail</h2>
        <p className="text-sm text-muted-foreground">
          Un lien de confirmation vient de vous être envoyé. Cliquez dessus pour activer votre compte.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-card rounded-2xl shadow-xl shadow-primary/5">
      <h2 className="text-3xl font-bold text-center mb-8 text-primary">Inscription</h2>
      
      <div className="mb-6 p-4 bg-surface rounded-xl border border-border">
        <h3 className="text-sm font-semibold mb-2">Localisation rapide</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Autorisez l&apos;accès GPS pour pré-remplir votre adresse (Quartier, Ville). La plateforme fonctionne mieux avec des profils proches.
        </p>
        <Button 
          type="button" 
          variant="secondary" 
          className="w-full text-primary"
          onClick={requestGPS}
          disabled={gpsLoading}
        >
          {gpsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
          {gpsLoading ? "Localisation en cours..." : "Utiliser ma position actuelle"}
        </Button>
        {gpsError && <p className="text-xs text-destructive mt-2">{gpsError}</p>}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Rôle</label>
          <select 
            {...form.register("role")}
            className="w-full h-12 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="employer">Je recrute (Employeur)</option>
            <option value="candidate">Je cherche un emploi (Candidat)</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Nom complet</label>
          <Input placeholder="Awa Dacosta" {...form.register("fullName")} />
          {form.formState.errors.fullName && <p className="text-xs text-destructive mt-1">{form.formState.errors.fullName.message}</p>}
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Email</label>
          <Input type="email" placeholder="email@exemple.com" {...form.register("email")} />
          {form.formState.errors.email && <p className="text-xs text-destructive mt-1">{form.formState.errors.email.message}</p>}
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Mot de passe</label>
          <Input type="password" placeholder="••••••••" {...form.register("password")} />
          {form.formState.errors.password && <p className="text-xs text-destructive mt-1">{form.formState.errors.password.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Pays</label>
            <Input placeholder="Congo-Brazzaville" {...form.register("country")} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Ville</label>
            <Input placeholder="Brazzaville" {...form.register("city")} />
          </div>
        </div>
        
        <div>
          <label className="text-sm font-medium mb-1 block">Quartier</label>
          <Input placeholder="Bacongo" {...form.register("neighborhood")} />
          {form.formState.errors.neighborhood && <p className="text-xs text-destructive mt-1">{form.formState.errors.neighborhood.message}</p>}
        </div>

        {submitError && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{submitError}</p>
        )}

        <Button type="submit" className="w-full h-12 mt-4 text-base font-semibold" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {form.formState.isSubmitting ? "Création du compte..." : "Créer mon compte"}
        </Button>
      </form>

      <p className="text-sm text-center text-muted-foreground mt-6">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
