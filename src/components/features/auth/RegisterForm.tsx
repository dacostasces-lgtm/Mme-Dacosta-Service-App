"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({
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
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: "employer",
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
            form.setValue("country", data.address.country || "Côte d'Ivoire");
            form.setValue("city", data.address.city || data.address.town || data.address.village || "Abidjan");
            form.setValue("neighborhood", data.address.suburb || data.address.neighbourhood || "");
          }
        } catch (err) {
          setGpsError("Erreur lors de la récupération de l'adresse.");
        } finally {
          setGpsLoading(false);
        }
      },
      (error) => {
        setGpsError("Permission refusée. Veuillez entrer votre adresse manuellement.");
        setGpsLoading(false);
      }
    );
  };

  const onSubmit = async (data: FormData) => {
    console.log("Submitting:", data);
    // TODO: Connect to Supabase Auth & Insert Profile
  };

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-card rounded-2xl shadow-xl shadow-primary/5">
      <h2 className="text-3xl font-bold text-center mb-8 text-primary">Inscription</h2>
      
      <div className="mb-6 p-4 bg-surface rounded-xl border border-border">
        <h3 className="text-sm font-semibold mb-2">Localisation rapide</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Autorisez l'accès GPS pour pré-remplir votre adresse (Quartier, Ville). La plateforme fonctionne mieux avec des profils proches.
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
            <Input placeholder="Côte d'Ivoire" {...form.register("country")} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Ville</label>
            <Input placeholder="Abidjan" {...form.register("city")} />
          </div>
        </div>
        
        <div>
          <label className="text-sm font-medium mb-1 block">Quartier</label>
          <Input placeholder="Cocody Angré" {...form.register("neighborhood")} />
          {form.formState.errors.neighborhood && <p className="text-xs text-destructive mt-1">{form.formState.errors.neighborhood.message}</p>}
        </div>

        <Button type="submit" className="w-full h-12 mt-4 text-base font-semibold">
          Créer mon compte
        </Button>
      </form>
    </div>
  );
}
