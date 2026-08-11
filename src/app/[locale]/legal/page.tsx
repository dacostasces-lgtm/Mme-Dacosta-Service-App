import type { Metadata } from "next";
import { LegalPage, Article, ToFill } from "@/components/shared/LegalPage";
import { COMPANY, HOSTING, missing } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: "Mentions légales",
  description:
    "Éditeur, responsable de publication et hébergeurs du site Madame Dacosta Services.",
};

export default function LegalNoticePage() {
  return (
    <LegalPage
      eyebrow="Légal"
      title="Mentions légales"
      summary="Qui édite ce site, qui en est responsable, et où il est hébergé."
    >
      <Article title="Éditeur du site">
        <p className="text-foreground font-medium">{COMPANY.name}</p>
        <ul className="space-y-1">
          <li>
            Forme juridique :{" "}
            {missing(COMPANY.legalForm) ? <ToFill label="Forme juridique" /> : COMPANY.legalForm}
          </li>
          <li>
            Capital social :{" "}
            {missing(COMPANY.shareCapital) ? <ToFill label="Capital" /> : COMPANY.shareCapital}
          </li>
          <li>RCCM : {missing(COMPANY.rccm) ? <ToFill label="RCCM" /> : COMPANY.rccm}</li>
          <li>
            Numéro d&apos;Identification Unique :{" "}
            {missing(COMPANY.niu) ? <ToFill label="NIU" /> : COMPANY.niu}
          </li>
          <li>
            Siège social : {COMPANY.address}, {COMPANY.city}, {COMPANY.country}
          </li>
          <li>
            Courriel :{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-primary hover:underline">
              {COMPANY.email}
            </a>
          </li>
          <li>
            Téléphone :{" "}
            <a href={`https://wa.me/${COMPANY.whatsapp}`} className="text-primary hover:underline">
              {COMPANY.phone}
            </a>
          </li>
        </ul>
      </Article>

      <Article title="Responsable de la publication">
        <p>
          {missing(COMPANY.publicationDirector) ? (
            <ToFill label="Nom du responsable de publication" />
          ) : (
            COMPANY.publicationDirector
          )}
        </p>
      </Article>

      <Article title="Hébergement">
        <ul className="space-y-3">
          {HOSTING.map((host) => (
            <li key={host.name}>
              <span className="text-foreground font-medium">{host.name}</span> — {host.role}
              <br />
              {host.address}
              <br />
              {host.site}
            </li>
          ))}
        </ul>
      </Article>

      <Article title="Propriété intellectuelle">
        <p>
          La marque {COMPANY.name}, le logo, la charte graphique et les contenus éditoriaux du site
          sont protégés. Toute reproduction ou représentation, totale ou partielle, sans
          autorisation écrite préalable est interdite.
        </p>
        <p>
          Les contenus publiés par les utilisateurs — présentations, photographies, curriculum
          vitæ — restent la propriété de leurs auteurs.
        </p>
      </Article>

      <Article title="Signalement d'un contenu">
        <p>
          Pour signaler un contenu illicite, une usurpation d&apos;identité ou une atteinte à vos
          droits, écrivez à{" "}
          <a href={`mailto:${COMPANY.email}`} className="text-primary hover:underline">
            {COMPANY.email}
          </a>{" "}
          en précisant l&apos;adresse de la page et le motif. Les signalements touchant à la
          sécurité des personnes sont traités en priorité.
        </p>
      </Article>

      <Article title="Données personnelles">
        <p>
          Le traitement des données est détaillé dans notre politique de confidentialité, et
          l&apos;usage du service est régi par nos conditions générales d&apos;utilisation.
        </p>
      </Article>
    </LegalPage>
  );
}
