import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
  './src/i18n/request.ts'
);

// Avatars are served from the project's storage bucket, whose host changes
// between local, preview and production. Derived rather than hard-coded so a
// new Supabase project doesn't silently break every image and every fetch.
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null;
  } catch {
    return null;
  }
})();

// The Content-Security-Policy is NOT here: it carries a per-request nonce and
// is therefore built in `src/proxy.ts`. Setting a second, static one at this
// level would leave two policies on the same response — the browser enforces
// the intersection, and the static one's `unsafe-inline` would have to be kept
// permissive enough to not fight the nonce, defeating the point. Everything
// below is request-independent and belongs here.
const SECURITY_HEADERS = [
  // Redundant with the proxy's frame-ancestors on modern browsers, and the
  // only clickjacking defence on the routes the proxy's matcher skips.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation is genuinely used by the signup form, so it stays allowed for
  // this origin; everything else is switched off.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * L'ancien site Wix, madamedacosta.com, garde 32 URL indexées qui concurrencent
 * le nouveau domaine sur les moteurs. Le domaine est repointé vers Vercel, qui
 * renvoie tout vers madamedacostaservices.com **en conservant le chemin** — les
 * anciens chemins arrivent donc ici, où rien ne leur répond.
 *
 * Ces règles leur donnent la page vivante la plus proche. Une 308 (`permanent`)
 * demande aux moteurs de transférer l'autorité de l'ancienne adresse à la
 * nouvelle ; une 307 la garderait indéfiniment sur l'ancienne.
 *
 * Deux limites assumées :
 *
 * - Les sources restent en ASCII. Les slugs du blog portent des accents, qui
 *   arrivent percent-encodés : `/post/nous-recrutons-ménagère-nounou` se
 *   présente comme `/post/nous-recrutons-m%C3%A9nag%C3%A8re-nounou`. Faire
 *   correspondre un préfixe sans accent est fiable ; écrire le slug entier ne
 *   l'est pas. D'où des préfixes, et un filet en fin de liste.
 * - Un `:param` collé à du texte ne peut pas être répété : path-to-regexp
 *   refuse `-:reste*` (« Can not repeat without a prefix and suffix ») et fait
 *   échouer le démarrage. Sans `*`, le paramètre couvre un segment, ce qui
 *   suffit : un slug d'article n'en contient jamais deux. Le `*` n'est gardé
 *   que sur les motifs où le paramètre suit une barre oblique.
 */
const ANCIENNES_URLS_WIX = [
  // Les six pages du site Wix. Destinations choisies sur leur contenu réel,
  // pas sur leur slug : « nos-offres » s'intitule CHAMP D'ACTION et décrit le
  // service, ce que porte désormais l'accueil.
  { source: '/nos-offres', destination: '/fr', permanent: true },
  { source: '/a-propos', destination: '/fr', permanent: true },
  { source: '/general-6', destination: '/fr', permanent: true },
  { source: '/challenges', destination: '/fr', permanent: true },
  { source: '/book-online', destination: '/fr/candidats', permanent: true },
  // Le blog servait surtout d'annonces : onze des dix-neuf articles en sont.
  { source: '/actualites', destination: '/fr/offres', permanent: true },

  // Les annonces du blog, par préfixe.
  { source: '/post/offre-d-emploi-:reste', destination: '/fr/offres', permanent: true },
  { source: '/post/nous-recrutons-:reste', destination: '/fr/offres', permanent: true },
  { source: '/post/recherche-:reste', destination: '/fr/offres', permanent: true },
  { source: '/post/cuisinier-:reste', destination: '/fr/offres', permanent: true },
  { source: '/post/commercial-:reste', destination: '/fr/offres', permanent: true },
  {
    source: '/post/international-live-in-nanny-:reste',
    destination: '/fr/offres',
    permanent: true,
  },

  // Le seul article éditorial qui a une vraie page d'arrivée : choisir sa
  // nounou, c'est parcourir les profils.
  {
    source: '/post/comment-choisir-sa-nounou-:reste',
    destination: '/fr/candidats',
    permanent: true,
  },

  // Filet : le reste du blog est éditorial — émotions de l'enfant, routines,
  // employée du mois — et n'a pas d'équivalent. L'accueil plutôt qu'une 404,
  // et plutôt que les offres, qui n'auraient rien à voir avec le sujet.
  { source: '/post/:reste*', destination: '/fr', permanent: true },
  { source: '/blog/:reste*', destination: '/fr', permanent: true },
] as const;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https" as const,
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // A cached service worker is a bug that outlives the deploy meant to
        // fix it: the browser would keep running the old one, still serving the
        // assets it cached, until its own heuristics expired the file.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // `en` was removed from routing.locales, so /en/* would 404. Anything
      // already shared or indexed lands on the French equivalent instead.
      { source: '/en', destination: '/fr', permanent: false },
      { source: '/en/:path*', destination: '/fr/:path*', permanent: false },
      ...ANCIENNES_URLS_WIX,
    ];
  },
};

export default withNextIntl(nextConfig);
