import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { NewCandidateForm } from "@/components/features/admin/NewCandidateForm";
import { requireUser } from "@/lib/auth/dal";
import { getLocations } from "@/lib/geo/locations";

export default async function NewCandidatePage() {
  await requireUser({ role: "admin" });
  const cities = await getLocations();

  return (
    <div className="flex-1 bg-surface bg-grain">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/admin"
          className={buttonVariants({
            variant: "ghost",
            className: "rounded-full gap-2 mb-4 -ml-2",
          })}
        >
          <ArrowLeft className="h-4 w-4" />
          Modération
        </Link>

        <h1 className="text-3xl font-bold mb-2">Ajouter un candidat</h1>
        <p className="text-muted-foreground mb-8">
          Pour les personnes rencontrées hors de la plateforme. Le compte est créé à leur
          nom sur leur numéro, et la fiche est publiée immédiatement — c&apos;est vous qui
          l&apos;avez vérifiée.
        </p>

        {cities.length === 0 ? (
          // Sans quartier, le déclencheur n'a rien à rattacher et la recherche
          // par proximité ne trouverait jamais la fiche.
          <div className="bg-card border border-border rounded-3xl shadow-soft p-8">
            <p className="font-medium mb-1">Aucune ville disponible.</p>
            <p className="text-sm text-muted-foreground">
              La liste des quartiers est vide : la migration{" "}
              <code className="font-mono">20260730000000_seed_neighborhoods</code> n&apos;est
              pas appliquée, ou la base est injoignable.
            </p>
          </div>
        ) : (
          <NewCandidateForm cities={cities} />
        )}
      </div>
    </div>
  );
}
