/**
 * Company and hosting facts used by the three legal pages.
 *
 * Gathered in one place so a legal notice is never a copy-paste of itself in
 * three files. Values come from the RCCM extract issued on 25/07/2025 by the
 * Tribunal de commerce de Brazzaville. A field left empty renders as a visible
 * "à compléter" marker rather than a plausible-looking invention: a wrong
 * registration number on a mentions légales page is a legal problem, an obvious
 * gap is merely a task.
 */

export const COMPANY = {
  /** Commercial name the service is known by. */
  name: "Madame Dacosta Services",
  /**
   * Registered trade name. It differs from the commercial name above, and the
   * registered activities are retail trade — not placement services. See the
   * note in the mentions légales page: this needs a registry amendment.
   */
  registeredName: "Ets GLWADYS",
  /** Sole trader: "immatriculation principale d'une personne physique". */
  legalForm: "Entreprise individuelle (personne physique)",
  operator: "Madame Altesse Asmao DACOSTA KAYINDA",
  /** Registre du Commerce et du Crédit Mobilier. */
  rccm: "CG-BZV-01-2014-A10-01609",
  rccmRegisteredOn: "25 juillet 2025",
  /** Numéro d'Identification Unique — absent de l'extrait RCCM. */
  niu: "",
  /** Établissement principal au RCCM. */
  address: "38, rue Mouléké, Ouenzé",
  city: "Brazzaville",
  country: "République du Congo",
  email: "contact@madamedacostaservices.com",
  phone: "+242 06 717 30 30",
  whatsapp: "242067173030",
  /** Responsable de la publication du site. */
  publicationDirector: "Madame Altesse Asmao DACOSTA KAYINDA",
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
export const LAST_UPDATED = "29 septembre 2026";

/** True when a field still needs the company's own information. */
export function missing(value: string) {
  return value.trim() === "";
}
