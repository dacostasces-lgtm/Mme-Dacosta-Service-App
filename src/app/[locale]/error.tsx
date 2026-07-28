"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/routing";

/**
 * Replaces Next.js's default error screen, which is in English and offers no
 * way back into the site.
 *
 * `unstable_retry` rather than `reset`: since 16.2 it re-fetches the segment as
 * well as re-rendering it, which is what a failed Supabase call needs — `reset`
 * alone would re-render the same stale failure.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex-1 grid place-items-center bg-surface bg-grain px-4 py-20">
      <div className="max-w-md text-center">
        <span className="h-16 w-16 rounded-2xl bg-destructive/10 text-destructive grid place-items-center mx-auto mb-6">
          <TriangleAlert className="h-8 w-8" />
        </span>

        <h1 className="text-2xl font-bold mb-3">Une erreur est survenue</h1>
        <p className="text-muted-foreground mb-8">
          Quelque chose n&apos;a pas fonctionné de notre côté. Réessayez dans un instant — si cela
          se reproduit, écrivez-nous sur WhatsApp et nous réglerons le problème.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => unstable_retry()} className="rounded-full gap-2">
            <RotateCcw className="h-4 w-4" />
            Réessayer
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline", className: "rounded-full" })}>
            Retour à l&apos;accueil
          </Link>
        </div>

        {/* The digest is what ties this screen to a line in the server logs. */}
        {error.digest && (
          <p className="text-xs text-muted-foreground mt-8">
            Référence de l&apos;incident : <code>{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  );
}
