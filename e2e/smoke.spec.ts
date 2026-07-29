import { expect, test } from "@playwright/test";

test.describe("pages publiques", () => {
  test("l'accueil s'affiche avec sa navigation", async ({ page }) => {
    await page.goto("/");
    // The proxy sends `/` to the default locale.
    await expect(page).toHaveURL(/\/fr$/);

    await expect(page.getByRole("link", { name: "Madame Dacosta" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Signed-out visitors are offered the two auth entry points.
    await expect(page.getByRole("link", { name: "S'inscrire" })).toBeVisible();
  });

  test("les offres et les tarifs se chargent", async ({ page }) => {
    await page.goto("/fr/offres");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.goto("/fr/pricing");
    await expect(page.getByRole("heading", { name: "Premium Candidat" })).toBeVisible();
  });

  test("une offre inexistante renvoie un vrai 404", async ({ page }) => {
    // The regression that mattered: a loading.tsx at the locale root turned
    // this into a 200 carrying the not-found page, which search engines read as
    // thin content rather than as a removal.
    const response = await page.goto("/fr/offres/99999999-2222-4333-8444-555555555555");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Cette page n'existe pas")).toBeVisible();
  });

  test("un identifiant mal formé renvoie 404, pas une erreur serveur", async ({ page }) => {
    const response = await page.goto("/fr/offres/pas-un-uuid");
    expect(response?.status()).toBe(404);
  });

  test("la CSP porte un nonce et refuse l'inline", async ({ page }) => {
    const response = await page.goto("/fr");
    const csp = response?.headers()["content-security-policy"] ?? "";

    expect(csp).toMatch(/script-src [^;]*'nonce-[a-f0-9]+'/);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("worker-src 'self'");
    // The whole point: an injected inline script must not be allowed.
    expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/);
  });

  test("aucune violation CSP ni erreur console à l'accueil", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      // Le rechargement à chaud de `next dev` ouvre une WebSocket qui échoue
      // sous Playwright : c'est un artefact du mode développement, pas une
      // violation de la politique de sécurité.
      const devNoise = /webpack-hmr|_next\/static\/chunks\/.*failed/i.test(text);
      if (!devNoise && (message.type() === "error" || /Content Security Policy/i.test(text))) {
        problems.push(text);
      }
    });

    await page.goto("/fr");
    await page.waitForLoadState("networkidle");

    expect(problems).toEqual([]);
  });

  test("robots.txt et sitemap.xml répondent", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
    expect(await robots.text()).toContain("Sitemap:");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    expect(await sitemap.text()).toContain("/fr/offres");
  });

  test("les pages privées redirigent un visiteur anonyme", async ({ page }) => {
    for (const path of ["/fr/profil", "/fr/dashboard/candidate", "/fr/messages", "/fr/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/fr\/login/);
    }
  });

  test("le mot de passe oublié est accessible sans être connecté", async ({ page }) => {
    await page.goto("/fr/login");
    await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
    await expect(page.getByRole("heading", { name: "Mot de passe oublié" })).toBeVisible();
  });
});
