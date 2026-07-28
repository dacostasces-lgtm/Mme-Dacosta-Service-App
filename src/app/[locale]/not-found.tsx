import { Compass, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/routing";

export default function NotFound() {
  return (
    <div className="flex-1 grid place-items-center bg-surface bg-grain px-4 py-20">
      <div className="max-w-md text-center">
        <span className="h-16 w-16 rounded-2xl bg-primary/10 text-primary grid place-items-center mx-auto mb-6">
          <Compass className="h-8 w-8" />
        </span>

        <p className="font-display text-5xl font-bold text-primary mb-3">404</p>
        <h1 className="text-2xl font-bold mb-3">Cette page n&apos;existe pas</h1>
        <p className="text-muted-foreground mb-8">
          Le lien est peut-être ancien, ou le profil que vous cherchiez n&apos;est plus en ligne.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/candidats" className={buttonVariants({ className: "rounded-full gap-2" })}>
            <Search className="h-4 w-4" />
            Chercher un profil
          </Link>
          <Link href="/" className={buttonVariants({ variant: "outline", className: "rounded-full" })}>
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
