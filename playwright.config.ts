import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a **local** Supabase stack.
 *
 * Never point these at the hosted project: they create users, jobs, bookings
 * and subscriptions, and there is no cleanup that could be trusted to run on a
 * database holding real profiles. `scripts/e2e.sh` starts the local stack,
 * resets it to a known state and exports its keys — run that rather than
 * `playwright test` directly.
 *
 * Un **build de production** est testé, pas `next dev`. Deux raisons : c'est
 * l'artefact réellement livré, et la CSP diffère entre les deux modes — un test
 * en développement validerait une politique que personne ne reçoit. Le build est
 * fait ici avec l'URL Supabase locale, puisque les NEXT_PUBLIC_* sont figées à
 * la construction.
 */
const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1")) {
  throw new Error(
    "Les tests e2e doivent viser la pile Supabase locale. Lancez `./scripts/e2e.sh`."
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Each spec signs up its own users, so a retry re-registers cleanly. Kept at
  // one worker: the specs share one database.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-FR",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      // Sans cela le projet desktop ramasse aussi mobile.spec.ts, dont les
      // assertions dépendent d'une largeur de téléphone.
      testIgnore: /mobile\.spec\.ts/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],

  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: BASE_URL,
    // Jamais réutilisé : le serveur en place peut porter un build fait avec
    // d'autres variables, donc viser une autre base.
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      NEXT_PUBLIC_MOMO_MTN_NUMBER: "060000000",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
    },
  },
});
