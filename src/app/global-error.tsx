"use client";

import "./globals.css";

/**
 * Last resort: this replaces the root layout when the layout itself throws —
 * which here means the Supabase session lookup in the Navbar failed, so no
 * shared chrome can be assumed. Everything it needs is inlined or imported
 * above; nothing from `[locale]/layout.tsx` is available.
 *
 * Client Component, so `metadata` cannot be exported — React's <title> element
 * is the supported way to name the page.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="fr">
      <body className="min-h-dvh grid place-items-center bg-background text-foreground p-6">
        <title>Erreur — Madame Dacosta Services</title>

        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-3">Le site est momentanément indisponible</h1>
          <p className="text-muted-foreground mb-8">
            Nous n&apos;arrivons pas à charger la page. Réessayez dans quelques instants.
          </p>

          <button
            onClick={() => unstable_retry()}
            className="h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold"
          >
            Réessayer
          </button>

          {error.digest && (
            <p className="text-xs text-muted-foreground mt-8">
              Référence de l&apos;incident : <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
