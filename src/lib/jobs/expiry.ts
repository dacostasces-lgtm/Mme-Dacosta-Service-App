/**
 * Durée de vie d'une offre. Les 15 jours sont aussi posés en base, par le
 * défaut de `jobs.expires_at` et le déclencheur clamp_job_expiry
 * (20261011030000_job_expiry.sql) : changer l'un sans l'autre ferait promettre
 * à l'écran une prolongation que la base refuserait.
 */
export const JOB_LIFETIME_DAYS = 15;

/** À partir de combien de jours restants l'employeur est relancé. */
export const REMINDER_DAYS = 3;

const DAY = 24 * 60 * 60 * 1000;

export type JobState = "available" | "expiring" | "expired" | "closed";

export function jobState(status: string, expiresAt: string, now = Date.now()): JobState {
  if (status !== "active") return "closed";
  const left = new Date(expiresAt).getTime() - now;
  if (left <= 0) return "expired";
  if (left <= REMINDER_DAYS * DAY) return "expiring";
  return "available";
}

/** Jours restants, arrondis au-dessus : « expire dans 1 jour » jusqu'au bout. */
export function daysLeft(expiresAt: string, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / DAY));
}

export function renewedExpiry(now = Date.now()) {
  return new Date(now + JOB_LIFETIME_DAYS * DAY).toISOString();
}
