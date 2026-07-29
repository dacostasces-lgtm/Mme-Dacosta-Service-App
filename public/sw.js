/**
 * Service worker for the installed app.
 *
 * The manifest already made the site installable, but nothing was cached — so
 * an installed app on a weak connection showed the browser's network error
 * page, which reads as a broken app rather than a missing signal. That matters
 * more here than on most sites: the audience is on mobile data in Brazzaville
 * and Pointe-Noire.
 *
 * Scope is deliberately narrow. This is not an offline mode: pages are
 * personalised and rendered per request, so caching them would show one user's
 * dashboard to the next. What it does is keep the shell — icons, static assets
 * — instantly available, and answer a failed navigation with a real page.
 */

const VERSION = "v1";
const SHELL_CACHE = `mdc-shell-${VERSION}`;
const ASSET_CACHE = `mdc-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const SHELL = [OFFLINE_URL, "/icon-192x192.png", "/icon-512x512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL))
  );
  // The new worker takes over on the next navigation rather than waiting for
  // every tab to close; without it a fix can sit unused for days.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Same origin only: Supabase responses carry auth and must never be stored.
  if (url.origin !== self.location.origin) return;

  // Never cache a rendered page — they are per-user and per-session. On a
  // failed navigation, serve the offline notice instead of the browser's.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      })
    );
    return;
  }

  // Build output is content-hashed, so a hit is always current: cache-first is
  // safe here and saves a round trip on every navigation.
  if (url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});
