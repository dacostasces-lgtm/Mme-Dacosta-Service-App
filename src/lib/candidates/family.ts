/**
 * Situation familiale d'un candidat : des listes à toucher, pas des champs à
 * écrire, et un seul endroit pour leurs libellés.
 *
 * Les valeurs sont celles qu'accepte la base
 * (20261022000000_situation_familiale.sql) ; les changer d'un côté sans
 * l'autre ferait refuser l'enregistrement.
 */

export const MARITAL_STATUS_OPTIONS = [
  { value: "celibataire", label: "Célibataire" },
  { value: "marie", label: "Marié(e)" },
  { value: "union_libre", label: "En couple (union libre)" },
  { value: "divorce", label: "Divorcé(e)" },
  { value: "separe", label: "Séparé(e)" },
  { value: "veuf", label: "Veuf / veuve" },
] as const;

export type MaritalStatus = (typeof MARITAL_STATUS_OPTIONS)[number]["value"];

export const MARITAL_STATUS_VALUES = MARITAL_STATUS_OPTIONS.map((option) => option.value) as [
  MaritalStatus,
  ...MaritalStatus[],
];

export function maritalStatusLabel(value: string | null | undefined) {
  return MARITAL_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? null;
}

/** 0 à 10 ; « 10 » se lit « 10 enfants ou plus ». */
export const MAX_CHILDREN_OPTION = 10;

export const CHILDREN_OPTIONS = Array.from({ length: MAX_CHILDREN_OPTION + 1 }, (_, count) => ({
  value: count,
  label:
    count === 0
      ? "Aucun enfant"
      : count === MAX_CHILDREN_OPTION
        ? `${count} enfants ou plus`
        : `${count} enfant${count > 1 ? "s" : ""}`,
}));

/** 0 à 18 ans ; « 18 » se lit « 18 ans ou plus ». */
export const MAX_CHILD_AGE_OPTION = 18;

export function childAgeLabel(age: number) {
  if (age === 0) return "Moins d'un an";
  if (age === MAX_CHILD_AGE_OPTION) return `${age} ans ou plus`;
  return `${age} an${age > 1 ? "s" : ""}`;
}

export const YOUNGEST_CHILD_AGE_OPTIONS = Array.from(
  { length: MAX_CHILD_AGE_OPTION + 1 },
  (_, age) => ({ value: age, label: childAgeLabel(age) })
);

/** « Aucun enfant », « 2 enfants, le plus jeune a 4 ans ». */
export function childrenSummary(
  count: number | null | undefined,
  youngestAge: number | null | undefined
) {
  if (count === null || count === undefined) return null;
  if (count === 0) return "Aucun enfant";
  const total =
    count >= MAX_CHILDREN_OPTION ? `${count} enfants ou plus` : `${count} enfant${count > 1 ? "s" : ""}`;
  if (youngestAge === null || youngestAge === undefined) return total;
  const youngest =
    youngestAge === 0
      ? "moins d'un an"
      : youngestAge >= MAX_CHILD_AGE_OPTION
        ? `${youngestAge} ans ou plus`
        : `${youngestAge} an${youngestAge > 1 ? "s" : ""}`;
  return count === 1 ? `${total}, qui a ${youngest}` : `${total}, le plus jeune a ${youngest}`;
}
