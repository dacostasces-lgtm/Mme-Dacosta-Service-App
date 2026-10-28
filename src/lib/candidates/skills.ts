/**
 * Les compétences proposées en un toucher, à la place d'une case à écrire.
 *
 * Beaucoup de candidates ont du mal à écrire ; et une compétence écrite en
 * phrase (« Garde-malade : surveillance, présence, alerte… ») ressortait sur la
 * fiche découpée à chaque virgule, en étiquettes sans queue ni tête. Ce qui
 * manque à la liste passe par « Autre compétence », en quelques mots.
 *
 * Aucune virgule dans les intitulés : la liste voyage jusqu'au serveur en une
 * chaîne séparée par des virgules, comme l'ancienne case.
 */
export const SKILL_GROUPS = [
  {
    label: "Enfants",
    skills: [
      "Garde de bébé",
      "Garde d'enfants",
      "Aide aux devoirs",
      "Jeux et éveil",
      "Accompagnement à l'école",
    ],
  },
  {
    label: "Maison",
    skills: ["Ménage", "Repassage", "Lessive", "Vaisselle", "Courses au marché"],
  },
  {
    label: "Cuisine",
    skills: ["Cuisine congolaise", "Cuisine européenne", "Pâtisserie"],
  },
  {
    label: "Personnes âgées et malades",
    skills: ["Aide à la toilette", "Aide à la mobilité", "Rappel des médicaments", "Garde de nuit"],
  },
  {
    label: "Autres",
    skills: ["Conduite (permis B)", "Jardinage", "Gardiennage", "Bricolage"],
  },
] as const;

export const SKILLS: readonly string[] = SKILL_GROUPS.flatMap((group) => group.skills);

/** Une compétence tient en quelques mots ; au-delà, c'est une phrase. */
export const MAX_SKILL_LENGTH = 40;

export const SKILL_TOO_LONG =
  "Chaque compétence doit tenir en quelques mots (40 caractères au plus) : choisissez-les dans la liste, ou raccourcissez celles écrites dans « Autre compétence ».";

/** L'intitulé de la liste qui correspond à une compétence déjà saisie, à la
 *  casse et à l'apostrophe près (« repassage », « garde d’enfants »). */
export function knownSkill(value: string) {
  // \u2019 : l'apostrophe typographique des claviers de téléphone.
  const key = (text: string) => text.trim().toLowerCase().replace(/\u2019/g, "'");
  return SKILLS.find((skill) => key(skill) === key(value)) ?? null;
}
