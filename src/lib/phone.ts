/**
 * Congolese phone numbers.
 *
 * The previous rule only checked which characters were allowed, so "06", "12"
 * and "0000000000000" all passed. A wrong number is worse here than a missing
 * one: it is the single channel an employer uses to reach a candidate, and
 * nobody discovers the typo until a placement fails.
 *
 * Congo-Brazzaville numbers are 9 digits starting with 0. Mobiles are 06/05/04
 * (MTN and Airtel), landlines 02. Written locally as 06 717 30 30, and
 * internationally as +242 06 717 30 30 — the country code does not replace the
 * leading zero, unlike most of the world, which is why so many forms mangle them.
 */

const NATIONAL_LENGTH = 9;

/** Mobile first, since almost every account uses one. */
const VALID_PREFIXES = ["06", "05", "04", "02"];

export type NormalisedPhone = { ok: true; value: string } | { ok: false; reason: string };

/** Everything that is not a digit goes, including a leading "+". */
function digitsOf(input: string) {
  return input.replace(/\D/g, "");
}

/**
 * Reduces any accepted spelling to the 9 national digits.
 * Returns null when the input cannot be one.
 */
export function nationalDigits(input: string): string | null {
  let digits = digitsOf(input);

  // "00242…" then "242…": strip the international prefix if present. Guarded on
  // length so a national number that happens to start with 242 is left alone —
  // there is none today, but the check costs nothing.
  if (digits.startsWith("00242")) digits = digits.slice(5);
  else if (digits.startsWith("242") && digits.length > NATIONAL_LENGTH) digits = digits.slice(3);

  return digits.length === NATIONAL_LENGTH ? digits : null;
}

/**
 * Validates and rewrites a number to one canonical form: `+242 06 717 30 30`.
 *
 * Storing a single shape matters beyond neatness — two spellings of the same
 * number cannot be compared, so duplicate accounts and failed lookups follow.
 */
export function normalisePhone(input: string): NormalisedPhone {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "Numéro vide." };

  const digits = nationalDigits(trimmed);

  if (!digits) {
    return {
      ok: false,
      reason: "Un numéro congolais compte 9 chiffres, par exemple 06 717 30 30.",
    };
  }

  if (!VALID_PREFIXES.some((prefix) => digits.startsWith(prefix))) {
    return {
      ok: false,
      reason: "Le numéro doit commencer par 06, 05, 04 ou 02.",
    };
  }

  const [, a, b, c, d] = digits.match(/^(\d{2})(\d{3})(\d{2})(\d{2})$/)!;
  return { ok: true, value: `+242 ${a} ${b} ${c} ${d}` };
}

/** True for an empty string too: these fields are optional. */
export function isValidOrEmpty(input: string | null | undefined) {
  if (!input || !input.trim()) return true;
  return normalisePhone(input).ok;
}

/** Shown under the inputs so the expected shape is visible before submitting. */
export const PHONE_HINT = "Format : 06 717 30 30";
