import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";

/**
 * Le message à montrer pour une erreur du service d'authentification.
 *
 * Quand Supabase Auth répond par une panne (500 à 504), la bibliothèque n'a pas
 * de message à remonter et sérialise la réponse brute : l'écran affichait
 * « Erreur lors de l'inscription : {} ». La cause réelle n'est alors lisible
 * que dans Supabase → Logs → Auth ; on le dit, avec le code, plutôt que des
 * accolades.
 *
 * `sendsEmail` : l'action envoie un email (inscription, mot de passe oublié).
 * C'est de loin la cause la plus fréquente d'une panne à ce moment-là — un
 * envoi SMTP qui échoue ou n'aboutit pas.
 */
export function authErrorMessage(error: AuthError, { sendsEmail = false } = {}) {
  const blank = !error.message || error.message === "{}";

  if (isAuthRetryableFetchError(error) || blank) {
    if (error.status === 0) {
      return "Connexion impossible au serveur. Vérifiez votre connexion internet puis réessayez.";
    }
    const code = error.status ? ` (code ${error.status})` : "";
    return sendsEmail
      ? `Le service n'a pas pu envoyer l'email de confirmation${code}. Réessayez dans quelques minutes, ou inscrivez-vous avec votre numéro.`
      : `Le service est momentanément indisponible${code}. Réessayez dans quelques minutes.`;
  }

  return error.message;
}
