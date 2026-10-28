import { startTransition, type FormEvent } from "react";

/**
 * Envoie un formulaire d'action sans le vider.
 *
 * React 19 remet à zéro les champs non contrôlés d'un `<form action>` dès que
 * l'action se termine, qu'elle ait enregistré ou refusé : un profil refusé
 * pour une seule case revenait avec l'âge, l'adresse et les listes effacés,
 * tout à ressaisir. Lancée depuis `onSubmit`, dans une transition, l'action
 * part sans cette remise à zéro — React ne la déclenche que pour l'envoi qu'il
 * fait lui-même.
 *
 * `action` reste sur le formulaire : avant le chargement du JavaScript, c'est
 * lui qui envoie.
 */
export function submitWithoutReset(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}
