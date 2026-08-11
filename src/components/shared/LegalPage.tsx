import type { ReactNode } from "react";
import { LAST_UPDATED } from "@/lib/legal/company";

/**
 * Shared shell for the three legal pages: a readable measure, consistent
 * headings, and the revision date so a reader can tell how current the text is.
 */
export function LegalPage({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 bg-surface bg-grain py-14 sm:py-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold">{title}</h1>
        <p className="mt-4 text-lg text-muted-foreground leading-relaxed">{summary}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Dernière mise à jour : {LAST_UPDATED}
        </p>

        <div className="mt-10 bg-card border border-border rounded-3xl shadow-soft p-6 sm:p-10 space-y-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Article({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

/** Marks a value the company still has to supply, so it cannot ship unnoticed. */
export function ToFill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded bg-amber-500/15 text-amber-700 dark:text-amber-500 px-1.5 py-0.5 text-xs font-medium">
      {label} à compléter
    </span>
  );
}
