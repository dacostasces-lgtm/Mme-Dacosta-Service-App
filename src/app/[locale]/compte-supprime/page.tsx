import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Compte supprimé",
  robots: { index: false, follow: false },
};

/** Où mène « Supprimer définitivement », une fois tout effacé. */
export default function AccountDeletedPage() {
  return (
    <div className="flex-1 grid place-items-center bg-surface bg-grain px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-3xl p-8 shadow-soft text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-green-500/10 text-green-700 dark:text-green-500">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-bold mb-2">Votre compte a été supprimé</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Vos informations personnelles sont effacées. Les paiements déjà faits restent
          enregistrés, sans votre nom, le temps exigé par la loi. Vous pouvez créer un nouveau
          compte quand vous le souhaitez.
        </p>
        <Link href="/" className={buttonVariants({ className: "h-11 rounded-full px-6" })}>
          Revenir à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
