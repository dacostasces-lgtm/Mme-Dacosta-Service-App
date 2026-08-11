import type { Metadata } from "next";
import { LegalPage, Article } from "@/components/shared/LegalPage";
import { COMPANY, DATA_LAW, HOSTING } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Quelles données Madame Dacosta Services collecte, pourquoi, combien de temps, et comment exercer vos droits.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Légal"
      title="Politique de confidentialité"
      summary="Nous collectons peu, mais nous collectons des données sensibles — dont votre position. Voici exactement lesquelles, pourquoi, et comment les faire supprimer."
    >
      <Article title="1. Responsable du traitement">
        <p>
          {COMPANY.name}, {COMPANY.address}, {COMPANY.city}, {COMPANY.country}. Contact :{" "}
          <a href={`mailto:${COMPANY.email}`} className="text-primary hover:underline">
            {COMPANY.email}
          </a>
          .
        </p>
        <p>
          Le traitement est soumis à la {DATA_LAW} en République du Congo, qui subordonne le
          traitement à votre consentement exprès et nous impose de vous informer de l&apos;usage
          fait de vos données.
        </p>
      </Article>

      <Article title="2. Données que nous collectons">
        <p>À l&apos;inscription et lors de l&apos;usage du service :</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Identité et contact</strong> : nom complet, adresse email, numéro de téléphone, numéro WhatsApp.</li>
          <li>
            <strong>Localisation</strong> : le quartier que vous choisissez, et — si vous
            l&apos;autorisez — vos coordonnées GPS précises.
          </li>
          <li>
            <strong>Profil professionnel</strong> (Candidats) : métier, expérience, compétences,
            langues, prétention salariale, présentation, photo, CV.
          </li>
          <li><strong>Échanges</strong> : le contenu des messages envoyés via la messagerie.</li>
          <li>
            <strong>Réservations et paiements</strong> : mission concernée, montant, moyen de
            paiement, référence de transaction Mobile Money. Nous ne voyons jamais votre code
            secret Mobile Money et ne conservons aucune donnée bancaire.
          </li>
          <li>
            <strong>Vérifications</strong> (Candidats) : le constat que votre identité, votre
            casier judiciaire ou votre entretien ont été vérifiés, avec la date et
            l&apos;administrateur qui l&apos;a constaté.
          </li>
        </ul>
      </Article>

      <Article title="3. Pourquoi la position GPS">
        <p>
          Le cœur du service est de proposer des profils <em>proches de chez vous</em>. Vos
          coordonnées servent uniquement à calculer une distance et à trier les résultats.
        </p>
        <p>
          Elles ne sont <strong>jamais affichées</strong> à un autre utilisateur : les fiches ne
          montrent qu&apos;un quartier et une distance en kilomètres. L&apos;accès à cette colonne
          est techniquement refusé à l&apos;interface publique, et la géolocalisation reste
          facultative — vous pouvez choisir votre quartier manuellement.
        </p>
      </Article>

      <Article title="4. Finalités">
        <ul className="list-disc pl-5 space-y-1">
          <li>créer et gérer votre compte ;</li>
          <li>afficher les profils vérifiés et permettre la recherche par proximité ;</li>
          <li>permettre aux utilisateurs de se contacter ;</li>
          <li>traiter les réservations et rapprocher les paiements Mobile Money ;</li>
          <li>vérifier les profils avant publication, pour la sécurité des familles ;</li>
          <li>vous informer par email d&apos;un nouveau message ou d&apos;un événement sur votre compte.</li>
        </ul>
      </Article>

      <Article title="5. Qui accède à vos données">
        <p>
          Les autres utilisateurs ne voient que ce que le service affiche : nom, quartier,
          distance, et pour les Candidats publiés leur profil professionnel. Vos coordonnées
          téléphoniques ne sont visibles que de vous et de nos administrateurs.
        </p>
        <p>Nous faisons appel aux prestataires techniques suivants :</p>
        <ul className="list-disc pl-5 space-y-1">
          {HOSTING.map((host) => (
            <li key={host.name}>
              <strong>{host.name}</strong> — {host.role.toLowerCase()} ({host.site}).
            </li>
          ))}
        </ul>
        <p>
          Nous ne vendons ni ne louons vos données. Elles peuvent être communiquées à une autorité
          si la loi nous y oblige.
        </p>
      </Article>

      <Article title="6. Transfert hors du Congo">
        <p>
          Nos serveurs de base de données sont situés en <strong>Irlande</strong> et notre
          hébergeur de site est une société américaine. Vos données sont donc traitées hors de
          République du Congo. En créant un compte, vous consentez à ce transfert, réalisé auprès
          de prestataires appliquant des mesures de sécurité reconnues.
        </p>
      </Article>

      <Article title="7. Durée de conservation">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Compte actif</strong> : tant que votre compte existe.</li>
          <li><strong>Après fermeture</strong> : suppression sous 30 jours, hors obligations légales.</li>
          <li>
            <strong>Réservations et paiements</strong> : conservés le temps requis par les
            obligations comptables et fiscales applicables.
          </li>
          <li>
            <strong>Messages</strong> : conservés tant que les deux comptes existent, afin que
            chacun garde l&apos;historique de ses échanges.
          </li>
        </ul>
      </Article>

      <Article title="8. Vos droits">
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification, de suppression,
          d&apos;opposition et de retrait de votre consentement. Vous pouvez modifier
          l&apos;essentiel de vos informations directement depuis votre profil.
        </p>
        <p>
          Pour les autres demandes, écrivez à{" "}
          <a href={`mailto:${COMPANY.email}`} className="text-primary hover:underline">
            {COMPANY.email}
          </a>{" "}
          ou au {COMPANY.phone}. Nous répondons dans un délai d&apos;un mois. Une pièce
          d&apos;identité peut vous être demandée, uniquement pour éviter qu&apos;un tiers
          n&apos;obtienne vos données.
        </p>
        <p>
          Le retrait du consentement à la géolocalisation se fait dans les réglages de votre
          navigateur ou de votre téléphone ; le service reste utilisable, sans le tri par
          proximité.
        </p>
      </Article>

      <Article title="9. Sécurité">
        <p>
          Les échanges sont chiffrés en transit. L&apos;accès aux données est cloisonné au niveau
          de la base : chaque utilisateur ne peut lire que ce qui le concerne, et les colonnes
          sensibles — téléphone, email, position — sont inaccessibles à l&apos;interface publique,
          y compris à un visiteur qui interrogerait directement notre interface de données.
        </p>
        <p>
          Aucun système n&apos;est infaillible. En cas de violation de données susceptible de vous
          porter préjudice, nous vous en informerons.
        </p>
      </Article>

      <Article title="10. Cookies et stockage local">
        <p>
          Nous n&apos;utilisons pas de cookies publicitaires ni de traceurs tiers. Sont déposés
          uniquement les éléments nécessaires au fonctionnement : maintien de votre session, et
          mémorisation de votre préférence de thème clair ou sombre.
        </p>
      </Article>

      <Article title="11. Enfants">
        <p>
          Le service n&apos;est pas destiné aux personnes de moins de 16 ans. Si un compte de
          mineur de moins de 16 ans nous est signalé, il est supprimé.
        </p>
      </Article>

      <Article title="12. Réclamation">
        <p>
          Si notre réponse ne vous satisfait pas, vous pouvez saisir l&apos;autorité compétente en
          matière de protection des données en République du Congo.
        </p>
      </Article>
    </LegalPage>
  );
}
