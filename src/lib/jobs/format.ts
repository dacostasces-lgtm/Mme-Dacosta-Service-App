/** Shared by the offers list and a single offer's page, which must not drift
 *  apart on how a salary or a date reads. */

export function formatSalary(min: number | null, max: number | null) {
  const format = (value: number) => new Intl.NumberFormat("fr-FR").format(value);
  if (min && max) return `${format(min)} – ${format(max)} FCFA / mois`;
  if (min) return `À partir de ${format(min)} FCFA / mois`;
  if (max) return `Jusqu'à ${format(max)} FCFA / mois`;
  return "Salaire à négocier";
}

export function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export function formatLongDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
