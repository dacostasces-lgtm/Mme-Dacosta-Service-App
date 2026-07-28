import "server-only";

/**
 * Per-user throttle for the write-heavy server actions.
 *
 * Supabase already rate-limits the auth endpoints by IP (sign-in, sign-up and
 * the reset emails, configured under `[auth.rate_limit]`), but nothing sat in
 * front of the actions this app defines itself: messaging, applications and
 * bookings could all be driven in a loop by one signed-in account.
 *
 * Deliberately in-memory. A serverless deployment runs several instances, so
 * the real ceiling is `limit × instances` rather than `limit` — this stops a
 * script hammering an endpoint, it is not a quota. Moving to Upstash or a
 * Postgres table is the upgrade when abuse actually shows up; the call sites
 * would not change.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Entries only matter until `resetAt`, so a stale sweep keeps the map bounded
 *  without a background timer. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function rateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number }
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true };
}

/** French, ready to hand straight back as an action's `error`. */
export function tooManyRequestsMessage(retryAfterSeconds: number) {
  if (retryAfterSeconds >= 60) {
    const minutes = Math.ceil(retryAfterSeconds / 60);
    return `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`;
  }
  return `Trop de tentatives. Réessayez dans ${retryAfterSeconds} seconde${
    retryAfterSeconds > 1 ? "s" : ""
  }.`;
}
