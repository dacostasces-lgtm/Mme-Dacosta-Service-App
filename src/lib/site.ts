/**
 * Canonical origin of the deployment.
 *
 * Shared rather than restated: the layout builds `metadataBase` from it, and
 * robots.txt and the sitemap have to agree with that exactly — a sitemap
 * pointing at a different host than the canonical tags is treated as spam
 * rather than as a hint.
 *
 * Set NEXT_PUBLIC_SITE_URL once a custom domain is in place; the fallback is
 * the Vercel URL the project ships with.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://mme-dacosta-service-app.vercel.app"
).replace(/\/$/, "");

/** Locale prefix of every public URL. Single-locale for now — see i18n/routing. */
export const DEFAULT_LOCALE = "fr";

export function absoluteUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** `/candidats` → `https://…/fr/candidats` */
export function localisedUrl(path: string) {
  return absoluteUrl(`/${DEFAULT_LOCALE}${path === "/" ? "" : path}`);
}
