"use client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin } from "lucide-react";

export function SearchFilters() {
  return (
    <div className="bg-card p-6 rounded-2xl shadow-sm border border-border sticky top-24">
      <h3 className="font-semibold text-lg mb-4">Filtres</h3>
      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium mb-2 block">Métier</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Ex: Nounou, Chauffeur..." />
          </div>
        </div>
        
        <div>
          <label className="text-sm font-medium mb-2 block">Quartier / Localisation</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Ex: Cocody Angré" />
          </div>
          <Button variant="outline" className="w-full mt-2 text-xs h-8">
            Utiliser ma position GPS
          </Button>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Rayon (Distance)</label>
          <input type="range" className="w-full accent-primary" min="1" max="50" defaultValue="10" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1 km</span>
            <span>50 km</span>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Disponibilité</label>
          <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option>Toutes</option>
            <option>Temps Plein</option>
            <option>Temps Partiel</option>
            <option>Interne (Logé)</option>
          </select>
        </div>

        <Button className="w-full h-10">Appliquer les filtres</Button>
      </div>
    </div>
  );
}
