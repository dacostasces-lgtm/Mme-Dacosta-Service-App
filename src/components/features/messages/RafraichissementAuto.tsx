"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/routing";

/**
 * Fait revenir la page chercher les nouveaux messages d'elle-même.
 *
 * Sans cela, un message reçu n'apparaissait qu'au rechargement : la page est
 * rendue côté serveur, et rien ne la rappelait. `router.refresh()` refait la
 * requête et fusionne le résultat sans perdre l'état client — ni le texte en
 * cours de frappe, ni la position de défilement.
 *
 * Pas de temps réel Supabase, et c'est un choix. Un canal pousserait la
 * notification, mais le contenu viendrait quand même d'un `router.refresh()` :
 * l'architecture serait la même, pour une dépendance de plus, un abonnement par
 * onglet et des tests qui ne passeraient pas — la pile locale des tests démarre
 * sans le service temps réel. C'est la voie d'amélioration si le volume le
 * justifie un jour.
 *
 * Deux précautions qui comptent ici, où l'on se connecte depuis un téléphone et
 * un forfait compté :
 *
 *   - rien ne tourne quand l'onglet n'est pas visible. Un intervalle laissé
 *     libre continue d'appeler le serveur pendant des heures sur un téléphone
 *     posé sur la table ;
 *   - au retour sur l'onglet, la page se rafraîchit tout de suite, sans
 *     attendre le prochain tour. C'est le moment où l'on regarde.
 */
const INTERVALLE_MS = 8_000;

export function RafraichissementAuto() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const arreter = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    const demarrer = () => {
      arreter();
      timer = setInterval(() => router.refresh(), INTERVALLE_MS);
    };

    const surVisibilite = () => {
      if (document.hidden) {
        arreter();
      } else {
        router.refresh();
        demarrer();
      }
    };

    if (!document.hidden) demarrer();
    document.addEventListener("visibilitychange", surVisibilite);

    return () => {
      arreter();
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [router]);

  return null;
}
