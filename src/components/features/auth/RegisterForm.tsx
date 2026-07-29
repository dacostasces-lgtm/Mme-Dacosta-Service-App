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
import { normalisePhone, PHONE_HINT } from "@/lib/phone";
import type { CityRef } from "@/lib/geo/locations";

const schema = z.object({
  fullName: z.string().min(2, "Requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Au moins 8 caractères"),
  role: z.enum(["employer", "candidate"]),
  phone: z
    .string()
    .trim()
    .min(1, "Requis")
    .refine((value) => normalisePhone(value).ok, {
      message: "Numéro invalide. Format attendu : 06 717 30 30.",
    }),
  // Ids from the seeded reference list, not free text. Typed quartiers are what
  // produced two Brazzaville rows in production, each with its own Bacongo.
  cityId: z.string().uuid("Choisissez une ville"),
  neighborhoodId: z.string().uuid("Choisissez un quartier"),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

type FormData = z.infer<typeof schema>;

export function RegisterForm({ cities }: { cities: CityRef[] }) {
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
      phone: "",
      // Brazzaville first: it is the launch city and carries most of the traffic.
      cityId: cities[0]?.id ?? "",
      neighborhoodId: "",
    },
  });

  const selectedCityId = form.watch("cityId");
  const selectedCity = cities.find((city) => city.id === selectedCityId) ?? cities[0];

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
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await res.json();
          const address = data?.address ?? {};

          // GPS now *preselects* from the reference list instead of writing text
          // into it. Nominatim returns names we do not control ("Congo",
          // "Bacongo Sud"…), so an unrecognised answer leaves the menus for the
          // user rather than inventing an entry — the coordinates are kept
          // either way, and they are what proximity search actually uses.
          const cityName = address.city || address.town || address.village || "";
          const matchedCity =
            cities.find((city) => city.name.toLowerCase() === cityName.toLowerCase()) ??
            selectedCity;

          if (matchedCity) {
            form.setValue("cityId", matchedCity.id);

            const quartierName = (address.suburb || address.neighbourhood || "")
              .toLowerCase();
            const matched = matchedCity.neighborhoods.find((quartier) =>
              quartierName.includes(quartier.name.toLowerCase())
            );

            if (matched) {
              form.setValue("neighborhoodId", matched.id);
            } else if (quartierName) {
              setGpsError(
                "Position enregistrée, mais votre quartier n'a pas été reconnu : choisissez-le dans la liste."
              );
            }
          }
        } catch {
          setGpsError("Position enregistrée, mais l'adresse n'a pas pu être lue.");
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

    // Computed once: calling normalisePhone twice would not narrow its union,
    // and the schema has already guaranteed this parses.
    const parsedPhone = normalisePhone(data.phone);
    const normalisedPhone = parsedPhone.ok ? parsedPhone.value : data.phone;

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
          // Normalised before it leaves the browser, so the trigger stores one
          // canonical shape whatever the user typed.
          phone: normalisedPhone,
          // The id is what the trigger uses; the names ride along for the
          // fallback path and cost nothing.
          neighborhood_id: data.neighborhoodId,
          city: selectedCity?.name,
          neighborhood: selectedCity?.neighborhoods.find(
            (quartier) => quartier.id === data.neighborhoodId
          )?.name,
          country: selectedCity?.country,
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

        <div>
          <label htmlFor="phone" className="text-sm font-medium mb-1 block">
            Téléphone
          </label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="06 717 30 30"
            {...form.register("phone")}
          />
          {form.formState.errors.phone ? (
            <p className="text-xs text-destructive mt-1">{form.formState.errors.phone.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">{PHONE_HINT}</p>
          )}
        </div>

        {/* Menus rather than text inputs: a typed quartier is what created two
            Brazzaville rows in production, and every misspelling silently
            excludes a profile from the proximity search. */}
        {cities.length === 0 ? (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            La liste des quartiers n&apos;a pas pu être chargée. Rechargez la page ou
            réessayez dans un instant.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cityId" className="text-sm font-medium mb-1 block">
                Ville
              </label>
              <select
                id="cityId"
                className="w-full h-12 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                {...form.register("cityId", {
                  // Changing city invalidates the quartier chosen under the old
                  // one, which would otherwise be submitted as a mismatched pair.
                  onChange: () => form.setValue("neighborhoodId", ""),
                })}
              >
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.cityId && (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.cityId.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="neighborhoodId" className="text-sm font-medium mb-1 block">
                Quartier
              </label>
              <select
                id="neighborhoodId"
                className="w-full h-12 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                {...form.register("neighborhoodId")}
              >
                <option value="">Choisir…</option>
                {(selectedCity?.neighborhoods ?? []).map((quartier) => (
                  <option key={quartier.id} value={quartier.id}>
                    {quartier.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.neighborhoodId && (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.neighborhoodId.message}
                </p>
              )}
            </div>
          </div>
        )}

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
