/**
 * Les métiers proposés en un toucher, à la place d'un champ à remplir :
 * beaucoup de candidates ont du mal à écrire, et un intitulé tapé à la main
 * (« nouno », « menagere ») ne ressort pas dans la recherche.
 *
 * Mêmes mots que les tuiles de la page d'accueil
 * (src/components/features/home/Categories.tsx), dont la recherche cherche ces
 * termes dans l'intitulé : « Cuisinier(ère) » répond à « Cuisinier »,
 * « Linge et repassage » à « Repassage ».
 */
export const METIERS = [
  "Nounou",
  "Ménagère",
  "Cuisinier(ère)",
  "Chauffeur",
  "Linge et repassage",
  "Gouvernante",
  "Gardien",
  "Jardinier",
  "Aide aux personnes âgées",
] as const;
