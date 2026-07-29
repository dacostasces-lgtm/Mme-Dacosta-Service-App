import { expect, test } from "@playwright/test";

/**
 * Runs on the Pixel 7 project only — see playwright.config.ts.
 *
 * The bottom bar exists because the header's links are `hidden md:flex`: below
 * that breakpoint the phone was left with a logo and a signup button and no way
 * to navigate at all.
 */
test.describe("navigation mobile", () => {
  test("la barre basse remplace les liens du haut", async ({ page }) => {
    await page.goto("/fr");

    const bottomNav = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(bottomNav).toBeVisible();

    await expect(bottomNav.getByRole("link", { name: "Accueil" })).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "Candidats" })).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "Offres" })).toBeVisible();
    // Fourth tab adapts to the session; signed out it offers sign-in.
    await expect(bottomNav.getByRole("link", { name: "Connexion" })).toBeVisible();

    // The header's own nav is hidden at this width — that is what the bar is for.
    await expect(
      page.locator("header nav").getByRole("link", { name: "Tarifs" })
    ).toBeHidden();
  });

  test("l'onglet actif suit la page", async ({ page }) => {
    await page.goto("/fr/candidats");
    const bottomNav = page.getByRole("navigation", { name: "Navigation principale" });

    await expect(bottomNav.getByRole("link", { name: "Candidats" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(bottomNav.getByRole("link", { name: "Accueil" })).not.toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("le pied de page reste atteignable sous la barre", async ({ page }) => {
    await page.goto("/fr");
    const legal = page.getByRole("link", { name: "Mentions Légales" });

    await legal.scrollIntoViewIfNeeded();
    await expect(legal).toBeVisible();
    // Would fail if the fixed bar covered it: Playwright refuses to click an
    // element another element sits on top of.
    await legal.click();
    await expect(page).toHaveURL(/\/fr\/legal/);
  });
});
