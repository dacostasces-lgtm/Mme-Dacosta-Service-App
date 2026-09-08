/**
 * Company and hosting facts used by the three legal pages.
 *
 * Gathered in one place so a legal notice is never a copy-paste of itself in
 * three files. Fields left empty are ones this codebase has no authoritative
 * source for — registration numbers, legal form, share capital. They render as
 * a visible "à compléter" marker rather than a plausible-looking invention:
 * a wrong RCCM on a mentions légales page is a legal problem, an obvious gap is
 * merely a task.
 */

export const COMPANY = {
  name: "Madame Dacosta Services",
  /** SARL, SA, entreprise individuelle… */
  legalForm: "",
  /** Registre du Commerce et du Crédit Mobilier. */
  rccm: "",
  /** Numéro d'Identification Unique. */
  niu: "",
  shareCapital: "",
  address: "18 rue Ampère, la Glacière, Bacongo",
  city: "Brazzaville",
  country: "République du Congo",
  email: "contact@madamedacostaservices.com",
  phone: "+242 06 717 30 30",
  whatsapp: "242067173030",
  /** Responsable de la publication du site. */
  publicationDirector: "",
} as const;

export const HOSTING = [
  {
    role: "Hébergement du site",
    name: "Vercel Inc.",
    address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
    site: "vercel.com",
  },
  {
    role: "Hébergement des données",
    name: "Supabase Inc.",
    address: "970 Toa Payoh North #07-04, Singapour 318992",
    // Worth stating plainly: it is what makes the transfer disclosure necessary.
    site: "supabase.com — serveurs situés en Irlande (région eu-west-1)",
  },
] as const;

/** Loi congolaise applicable au traitement des données personnelles. */
export const DATA_LAW =
  "loi n° 29-2019 du 10 octobre 2019 portant protection des données à caractère personnel";

/** Last substantive revision, shown to readers so they can spot a stale text. */
export const LAST_UPDATED = "9 août 2026";

/** True when a field still needs the company's own information. */
export function missing(value: string) {
  return value.trim() === "";
}
