import { FileText } from "lucide-react";

/**
 * Shared shell for the three legal pages. They exist so the footer no longer
 * leads to a 404, and they say plainly that the document is not written yet —
 * inventing terms of service or a privacy policy would be worse than an empty
 * page, because users would believe they had read something binding.
 */
export function LegalPage({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="min-h-screen bg-background py-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-4">{title}</h1>
        <p className="text-muted-foreground leading-relaxed mb-8">{summary}</p>

        <div className="bg-surface border border-border rounded-2xl p-6 flex gap-4">
          <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground mb-1">Document en cours de rédaction</p>
            <p>
              Ce texte sera publié avant l&apos;ouverture du service. D&apos;ici là, pour toute
              question sur vos données ou vos droits, écrivez à{" "}
              <a href="mailto:contact@madamedacosta.com" className="text-primary hover:underline">
                contact@madamedacosta.com
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
