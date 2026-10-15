/**
 * Les seuls messages que la page de connexion accepte d'afficher.
 *
 * Elle rendait auparavant le paramètre `?error=` tel quel, et `/auth/confirm` y
 * recopiait l'`error_description` de sa propre URL. Un lien forgé affichait
 * donc le texte de son choix — « votre compte est bloqué, payez… » — sur le
 * vrai domaine, en HTTPS valide, ce qui est exactement ce qu'il faut pour une
 * arnaque convaincante.
 *
 * Un code inconnu ne donne rien : on préfère ne rien dire qu'afficher ce qu'un
 * inconnu a écrit.
 */
export const MESSAGES_CONNEXION = {
  lien_refuse: "Ce lien de confirmation a été refusé. Demandez-en un nouveau.",
  lien_expire: "Ce lien a expiré. Demandez-en un nouveau.",
  lien_invalide: "Ce lien n'est plus valable. Demandez-en un nouveau.",
  session_expiree: "Votre session a expiré. Reconnectez-vous.",
} as const;

export type CodeConnexion = keyof typeof MESSAGES_CONNEXION;

export function messageConnexion(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return MESSAGES_CONNEXION[code as CodeConnexion];
}
