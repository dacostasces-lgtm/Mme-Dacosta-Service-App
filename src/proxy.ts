import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const handleI18n = createMiddleware(routing);

/**
 * Routes that require a session, matched on the path with the locale stripped.
 *
 * This is the *optimistic* check the Next.js auth guide describes, not the
 * authorisation itself — `requireUser()` in the DAL stays the authority, and
 * every one of these pages still calls it. What this adds is an honest HTTP
 * 307 before rendering starts.
 *
 * It matters because `[locale]/loading.tsx` puts each page behind a Suspense
 * boundary: the shell is flushed before the page runs, so a `redirect()` raised
 * inside it can no longer become a real redirect. It is serialised into the RSC
 * payload and replayed by the browser, leaving the response a 200 — crawlers
 * index a skeleton, and signed-out visitors watch it flash before being bounced.
 */
const PROTECTED = [
  /^\/admin(\/|$)/,
  /^\/dashboard(\/|$)/,
  /^\/messages(\/|$)/,
  /^\/profil(\/|$)/,
  /^\/offres\/creer(\/|$)/,
  // The password *change* screen, not `/mot-de-passe-oublie`, which has to stay
  // reachable precisely because the visitor cannot sign in.
  /^\/mot-de-passe(\/|$)/,
  /^\/candidats\/[^/]+\/reserver(\/|$)/,
];

function pathWithoutLocale(pathname: string) {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return '/';
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

function requiresSession(pathname: string) {
  const path = pathWithoutLocale(pathname);
  return PROTECTED.some((pattern) => pattern.test(path));
}

/** The locale already in the URL, so a redirect keeps the visitor in it. */
function localeOf(pathname: string) {
  const segment = pathname.split('/')[1];
  return routing.locales.includes(segment as (typeof routing.locales)[number])
    ? segment
    : routing.defaultLocale;
}

/**
 * Origine complète de l'API Supabase, port compris.
 *
 * Reconstruire `https://${hostname}` perdait le port : l'API locale, servie sur
 * http://127.0.0.1:54321, n'était donc jamais autorisée par connect-src, et
 * chaque appel — inscription, connexion — échouait silencieusement.
 */
const supabase = (() => {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    return {
      origin: url.origin,
      socket: `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`,
      secure: url.protocol === 'https:',
    };
  } catch {
    return null;
  }
})();

/**
 * Per-request Content-Security-Policy.
 *
 * The policy lived in next.config.ts with `script-src 'unsafe-inline'`, which
 * made it useless against XSS: an injected `<script>` was allowed by the very
 * directive meant to stop it. A nonce is the fix — Next.js reads it from the
 * CSP *request* header during render and stamps it onto its own inline
 * bootstrap scripts, so those run while anything injected does not.
 *
 * `'strict-dynamic'` lets those trusted scripts load the chunks they need
 * without every chunk URL being listed.
 */
function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === 'development';

  return [
    "default-src 'self'",
    // 'unsafe-eval' only in development: React uses eval there to rebuild
    // server stack traces in the browser. Production needs neither.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // style-src deliberately keeps 'unsafe-inline'. Framer Motion animates by
    // writing inline `style` attributes, which a nonce cannot cover —
    // style-src-attr falls back to style-src, and a nonce there would block
    // every animation on the site. Inline styles are not an XSS vector in the
    // way inline scripts are, so this is the trade worth making.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase ? ` ${supabase.origin}` : ' https:'}`,
    "font-src 'self' data:",
    // `ws:` uniquement en développement, pour la WebSocket de rechargement à
    // chaud. Sans elle la politique cassait `next dev` entièrement : le client
    // HMR de Turbopack échoue, l'hydratation ne se termine jamais, et plus
    // aucun formulaire ni bouton ne répond — en local seulement, la production
    // restant interactive. Rien dans la console ne reliait le symptôme à la CSP.
    `connect-src 'self'${
      supabase ? ` ${supabase.origin} ${supabase.socket}` : ' https:'
    } https://nominatim.openstreetmap.org${isDev ? ' ws: wss:' : ''}`,
    // Stated explicitly rather than left to the fallback chain: worker-src
    // falls back to script-src, which carries 'strict-dynamic' and a nonce —
    // neither of which a `serviceWorker.register('/sw.js')` call can satisfy.
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // Omis dès qu'une dépendance est servie en clair. La directive réécrit tout
    // http:// en https://, donc y compris l'API Supabase locale : chaque appel
    // échouait en ERR_SSL_PROTOCOL_ERROR — plus d'inscription, plus de connexion
    // — sans rien d'explicite dans la console. La condition porte sur l'URL et
    // non sur NODE_ENV, car un build de production peut viser une base locale,
    // ce que fait précisément la suite de tests.
    ...(supabase && !supabase.secure ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export default async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = contentSecurityPolicy(nonce);

  // Set on the *request*: that is where Next.js looks for the nonce when it
  // renders. next-intl copies the incoming headers onto the request it forwards
  // downstream, so patching them here is enough for both to see it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = handleI18n(new NextRequest(request, { headers: requestHeaders }));

  // And on the response, which is what the browser actually enforces.
  response.headers.set('Content-Security-Policy', csp);

  // Refresh the Supabase auth session so server components always see valid
  // tokens. Skipped when Supabase isn't configured (e.g. fresh clone without
  // .env.local) so the rest of the app keeps working.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && requiresSession(request.nextUrl.pathname)) {
      const loginUrl = new URL(
        `/${localeOf(request.nextUrl.pathname)}/login`,
        request.url
      );
      const redirectResponse = NextResponse.redirect(loginUrl);

      // Carry over the CSP and anything the session refresh just wrote —
      // getUser() clears cookies when it finds an expired token, and dropping
      // that here would leave the browser retrying with a dead session.
      redirectResponse.headers.set('Content-Security-Policy', csp);
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));

      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  // Keep in step with routing.locales — a locale listed here but absent there
  // gets matched by the middleware and then has nowhere to route to.
  matcher: ['/', '/(fr)/:path*'],
};
