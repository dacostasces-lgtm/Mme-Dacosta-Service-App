/**
 * 404 racine.
 *
 * Sert les URL qui n'appartiennent à aucune route — donc hors du segment
 * `[locale]`, sans navigation ni pied de page. Les 404 levées *dans* une page
 * passent par `[locale]/not-found.tsx`, qui garde la chrome du site.
 *
 * Le lien passe par `next/link` et non par celui de next-intl : cette page est
 * rendue hors du contexte de locale, où ce dernier n'a pas de routeur à
 * interroger — d'où le préfixe écrit en clair.
 */
import Link from "next/link";

export const metadata = {
  title: "Page introuvable — Madame Dacosta Services",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex-1 grid place-items-center bg-surface px-4 py-20">
      <div className="max-w-md text-center">
        <p className="font-bold text-xl text-primary mb-8">Madame Dacosta Services</p>
        <p className="font-display text-5xl font-bold text-primary mb-3">404</p>
        <h1 className="text-2xl font-bold mb-3">Cette page n&apos;existe pas</h1>
        <p className="text-muted-foreground mb-8">
          Le lien est peut-être ancien, ou le profil que vous cherchiez n&apos;est plus en ligne.
        </p>
        <Link
          href="/fr/candidats"
          className="inline-flex items-center justify-center h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold"
        >
          Chercher un profil
        </Link>
      </div>
    </div>
  );
}
