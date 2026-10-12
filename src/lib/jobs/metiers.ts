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
  "Garde-malade",
  "Répétiteur (cours à domicile)",
  "Agent d'entretien",
  "Coursier",
] as const;

/**
 * Le mot cherché dans l'intitulé quand on filtre par métier : la partie
 * entre parenthèses n'est pas toujours tapée (« Cuisinier » pour
 * « Cuisinier(ère) »), et un intitulé saisi avant les boutons peut ne porter
 * que le mot principal (« Repassage »).
 */
const SEARCH_TERMS: Partial<Record<(typeof METIERS)[number], string>> = {
  "Cuisinier(ère)": "Cuisinier",
  "Linge et repassage": "repassage",
  "Aide aux personnes âgées": "personnes âgées",
  "Répétiteur (cours à domicile)": "Répétiteur",
};

export function isMetier(value: string | undefined | null): value is (typeof METIERS)[number] {
  return (METIERS as readonly string[]).includes(value ?? "");
}

export function metierSearchTerm(metier: (typeof METIERS)[number]) {
  return SEARCH_TERMS[metier] ?? metier;
}
