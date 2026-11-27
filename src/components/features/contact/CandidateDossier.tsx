import { FileText, IdCard, Lock } from "lucide-react";
import { documentHref, identityTypeLabel, needsBackSide } from "@/lib/candidates/documents";

export type DossierRow = {
  gender: string | null;
  identity_type: string | null;
  identity_front: boolean;
  identity_back: boolean;
  driving_license: boolean;
  cv: boolean;
};

const LINK = "font-medium text-primary hover:underline";

/**
 * Le dossier complet d'un candidat — pièces d'identité, permis, CV — pour
 * l'employeur qui a payé l'accès à ce candidat, et pour l'administration
 * (candidate_dossier, 20261127100000). Chaque lien redemande le fichier au
 * clic : un lien signé posé dans la page expirerait pendant qu'elle reste
 * ouverte.
 *
 * Sans accès, l'employeur lit ce qui l'ouvrirait, plutôt que de ne rien voir
 * et de croire que le dossier n'existe pas.
 */
export function CandidateDossier({
  candidateId,
  dossier,
}: {
  candidateId: string;
  /** Null : l'employeur n'a pas (encore) payé l'accès à ce candidat. */
  dossier: DossierRow | null;
}) {
  if (!dossier) {
    return (
      <section className="bg-surface rounded-3xl p-6 border border-border mb-8">
        <h2 className="font-bold mb-2 flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" aria-hidden />
          Pièces d&apos;identité et CV
        </h2>
        <p className="text-sm text-muted-foreground">
          Visibles une fois le numéro de ce candidat obtenu, si ce candidat a postulé à l&apos;une
          de vos offres payantes, ou avec l&apos;abonnement Premium Employeur.
        </p>
      </section>
    );
  }

  const passeport = dossier.identity_type === "passeport";
  const type = identityTypeLabel(dossier.identity_type);
  const rien =
    !dossier.identity_front && !dossier.identity_back && !dossier.driving_license && !dossier.cv;

  return (
    <section className="bg-card rounded-3xl p-6 sm:p-8 border border-border shadow-soft mb-8">
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
        <IdCard className="h-5 w-5 text-primary" aria-hidden />
        Dossier du candidat
      </h2>
      <p className="text-xs text-muted-foreground mb-5">
        Réservé à notre équipe et aux employeurs qui ont payé l&apos;accès à ce candidat. Ne le
        transmettez à personne.
      </p>

      <dl className="grid gap-4 sm:grid-cols-2 text-sm">
        {dossier.gender && (
          <div>
            <dt className="text-muted-foreground">Sexe</dt>
            <dd className="font-medium">{dossier.gender === "F" ? "Femme" : dossier.gender === "M" ? "Homme" : dossier.gender}</dd>
          </div>
        )}

        <div>
          <dt className="text-muted-foreground">Pièce d&apos;identité{type ? ` · ${type}` : ""}</dt>
          <dd className="flex flex-wrap gap-x-4 gap-y-1">
            {dossier.identity_front ? (
              <a
                href={documentHref(candidateId, "identity_front")}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                {passeport ? "Voir la page du passeport" : "Voir le recto"}
              </a>
            ) : (
              <span className="text-muted-foreground">Pas encore envoyée</span>
            )}
            {needsBackSide(dossier.identity_type) && dossier.identity_back && (
              <a
                href={documentHref(candidateId, "identity_back")}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                Voir le verso
              </a>
            )}
          </dd>
        </div>

        {dossier.driving_license && (
          <div>
            <dt className="text-muted-foreground">Permis de conduire</dt>
            <dd>
              <a
                href={documentHref(candidateId, "driving_license")}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                Voir le permis
              </a>
            </dd>
          </div>
        )}

        <div>
          <dt className="text-muted-foreground">CV</dt>
          <dd>
            {dossier.cv ? (
              <a
                href={`/api/cv/${candidateId}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${LINK} inline-flex items-center gap-1`}
              >
                <FileText className="h-4 w-4" aria-hidden />
                Voir le CV
              </a>
            ) : (
              <span className="text-muted-foreground">Pas de CV déposé</span>
            )}
          </dd>
        </div>
      </dl>

      {rien && (
        <p className="text-sm text-muted-foreground mt-4">
          Ce candidat n&apos;a encore envoyé aucun document.
        </p>
      )}
    </section>
  );
}
