import type { Metadata } from "next";
import { LegalPage, Article } from "@/components/shared/LegalPage";
import { COMPANY } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation",
  description:
    "Les règles d'usage de la plateforme Madame Dacosta Services : rôles, vérification des profils, frais de mise en relation, responsabilités.",
};

export default function CguPage() {
  return (
    <LegalPage
      eyebrow="Légal"
      title="Conditions Générales d'Utilisation"
      summary="Ce que vous pouvez faire sur la plateforme, ce que nous nous engageons à faire, et ce que nous ne faisons pas."
    >
      <Article title="1. Objet">
        <p>
          Les présentes conditions régissent l&apos;utilisation de la plateforme éditée par{" "}
          {COMPANY.name} (ci-après « la Plateforme »), qui met en relation des particuliers ou
          entreprises cherchant du personnel de maison (« Employeurs ») avec des personnes
          proposant ces services (« Candidats »).
        </p>
        <p>
          Créer un compte vaut acceptation de ces conditions. Si vous ne les acceptez pas,
          n&apos;utilisez pas la Plateforme.
        </p>
      </Article>

      <Article title="2. Ce que la Plateforme est, et ce qu'elle n'est pas">
        <p>
          La Plateforme est un service de <strong>mise en relation</strong>. Elle n&apos;est ni
          l&apos;employeur, ni le mandataire des Candidats, et n&apos;est pas partie au contrat de
          travail éventuellement conclu entre un Employeur et un Candidat.
        </p>
        <p>
          Il appartient à l&apos;Employeur de respecter la législation du travail applicable en
          République du Congo : contrat écrit, rémunération, déclaration, cotisations sociales et
          conditions de travail relèvent de sa seule responsabilité.
        </p>
      </Article>

      <Article title="3. Inscription et éligibilité">
        <p>
          L&apos;inscription est réservée aux personnes physiques âgées d&apos;au moins 16 ans, ou
          aux personnes morales représentées par une personne habilitée. Vous vous engagez à
          fournir des informations exactes et à les tenir à jour, notamment votre numéro de
          téléphone, qui est le principal canal de contact entre utilisateurs.
        </p>
        <p>
          Vous êtes responsable de la confidentialité de votre mot de passe et de toute activité
          menée depuis votre compte.
        </p>
      </Article>

      <Article title="4. Vérification et publication des profils">
        <p>
          Un profil de Candidat n&apos;apparaît pas automatiquement dans la recherche : il est
          publié après examen par notre équipe. Nous pouvons enregistrer, pour chaque Candidat, la
          vérification de son identité, de son casier judiciaire et le passage d&apos;un entretien.
          Ces mentions n&apos;apparaissent sur un profil <strong>que lorsqu&apos;elles ont
          effectivement été constatées</strong>, avec la date du contrôle.
        </p>
        <p>
          Ces vérifications sont un travail de diligence, non une garantie absolue de comportement
          futur. Nous vous recommandons de rencontrer la personne, de demander ses références et de
          formaliser la relation par écrit avant tout engagement.
        </p>
        <p>
          Nous pouvons refuser, dépublier ou suspendre un profil, notamment en cas
          d&apos;informations fausses, d&apos;usurpation d&apos;identité, de contenu illicite ou de
          comportement portant atteinte à la sécurité des autres utilisateurs.
        </p>
      </Article>

      <Article title="5. Frais de mise en relation et abonnements">
        <p>
          La création de compte, la consultation des profils et la messagerie sont gratuites. Une
          réservation donne lieu à des frais de mise en relation, dont le montant est affiché avant
          toute confirmation.
        </p>
        <p>
          Le règlement s&apos;effectue par transfert Mobile Money vers le numéro indiqué, en
          rappelant la référence de la réservation. Une réservation n&apos;est considérée comme
          réglée qu&apos;après vérification du paiement. Aucun prélèvement automatique n&apos;est
          effectué : c&apos;est vous qui déclenchez le transfert.
        </p>
        <p>
          Les abonnements Premium sont sans engagement et s&apos;interrompent à leur échéance en
          l&apos;absence de renouvellement. Les frais et abonnements ne sont pas remboursables une
          fois la mise en relation effectuée, sauf disposition légale contraire ou geste commercial
          de notre part.
        </p>
      </Article>

      <Article title="6. Comportement des utilisateurs">
        <p>Il est notamment interdit d&apos;utiliser la Plateforme pour :</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>publier des informations fausses ou usurper l&apos;identité d&apos;un tiers ;</li>
          <li>
            proposer ou solliciter un travail contraire à la loi, en particulier le travail des
            mineurs de moins de 16 ans ou le travail forcé ;
          </li>
          <li>harceler, menacer ou discriminer un autre utilisateur ;</li>
          <li>
            collecter les coordonnées d&apos;autres utilisateurs à des fins de démarchage ou de
            revente ;
          </li>
          <li>contourner les frais de mise en relation par une fausse annulation.</li>
        </ul>
      </Article>

      <Article title="7. Contenus publiés">
        <p>
          Vous restez propriétaire des contenus que vous publiez (texte de présentation, photo,
          CV). Vous nous accordez le droit de les afficher sur la Plateforme aux fins du service.
          Vous garantissez disposer des droits nécessaires, notamment sur les photographies.
        </p>
      </Article>

      <Article title="8. Responsabilité">
        <p>
          Nous mettons en œuvre les moyens raisonnables pour assurer la disponibilité et la
          sécurité du service, sans pouvoir garantir une disponibilité ininterrompue.
        </p>
        <p>
          La Plateforme ne saurait être tenue responsable de l&apos;exécution du travail, des
          dommages survenus au domicile de l&apos;Employeur, ni des différends entre Employeur et
          Candidat. Notre responsabilité éventuelle est limitée aux sommes que vous nous avez
          versées au titre de la mise en relation concernée.
        </p>
      </Article>

      <Article title="9. Suspension et résiliation">
        <p>
          Vous pouvez fermer votre compte à tout moment en nous écrivant. Nous pouvons suspendre ou
          fermer un compte en cas de manquement à ces conditions, après information de
          l&apos;intéressé sauf urgence ou obligation légale.
        </p>
      </Article>

      <Article title="10. Données personnelles">
        <p>
          Le traitement de vos données est décrit dans notre politique de confidentialité, qui fait
          partie intégrante des présentes conditions.
        </p>
      </Article>

      <Article title="11. Modification des conditions">
        <p>
          Ces conditions peuvent évoluer. La date de dernière mise à jour figure en tête de page.
          En cas de modification substantielle, les utilisateurs inscrits en sont informés.
        </p>
      </Article>

      <Article title="12. Droit applicable et litiges">
        <p>
          Les présentes conditions sont soumises au droit de la République du Congo. En cas de
          litige, les parties rechercheront une solution amiable ; à défaut, les tribunaux
          compétents de Brazzaville seront saisis.
        </p>
        <p>
          Pour toute question :{" "}
          <a href={`mailto:${COMPANY.email}`} className="text-primary hover:underline">
            {COMPANY.email}
          </a>{" "}
          ou {COMPANY.phone}.
        </p>
      </Article>
    </LegalPage>
  );
}
