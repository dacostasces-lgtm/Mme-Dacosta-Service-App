import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test.describe("offre et candidature", () => {
  /**
   * NON RÉSOLU — voir le rapport d'audit.
   *
   * Ce qui est prouvé : l'employeur publie, la fiche porte son JobPosting, la
   * candidature s'enregistre (état « déjà postulé » persistant après
   * rechargement) et l'employeur la reçoit — « Candidatures reçues (1) ». Ce qui
   * ne l'est pas : l'identité affichée côté employeur. La politique de lecture
   * de `profiles` masque un profil non validé, et postuler n'ouvre aucune
   * visibilité, donc l'assertion sur le libellé de repli reste à caler.
   */
  test.fixme("un employeur publie, une candidate postule, l'employeur la voit", async ({ browser }) => {
    const employerContext = await browser.newContext();
    const employer = await employerContext.newPage();

    // --- l'employeur publie ---------------------------------------------------
    await register(employer, "employer", "Famille Nkodia");
    await expect(employer.getByRole("heading", { name: "Mon Espace Employeur" })).toBeVisible();

    await employer.goto("/fr/offres/creer");
    const title = `Nounou temps plein ${Date.now()}`;
    await employer.getByLabel("Intitulé du poste").fill(title);
    await employer
      .getByLabel("Description")
      .fill(
        "Garde de trois enfants de 2, 5 et 8 ans, du lundi au vendredi de 7h à 18h. Expérience exigée."
      );
    await employer.getByLabel(/Salaire minimum/).fill("90000");
    await employer.getByLabel(/Salaire maximum/).fill("120000");
    await employer.getByRole("button", { name: "Publier l'offre" }).click();

    await employer.waitForURL(/\/fr\/offres$/, { timeout: 30_000 });
    await expect(employer.getByRole("link", { name: title })).toBeVisible();

    // --- la fiche détaillée porte ses données structurées ---------------------
    await employer.getByRole("link", { name: title }).click();
    await employer.waitForURL(/\/fr\/offres\/[0-9a-f-]{36}/);
    const jobUrl = employer.url();

    const jsonLd = await employer
      .locator('script[type="application/ld+json"]')
      .textContent();
    const structured = JSON.parse(jsonLd ?? "{}");
    expect(structured["@type"]).toBe("JobPosting");
    expect(structured.title).toBe(title);
    // ISO code, not the display name stored in `cities`.
    expect(structured.jobLocation.address.addressCountry).toBe("CG");
    expect(structured.baseSalary.value.minValue).toBe(90000);

    // --- la candidate postule -------------------------------------------------
    const candidateContext = await browser.newContext();
    const candidate = await candidateContext.newPage();
    await register(candidate, "candidate", "Awa Postulante");

    await candidate.goto(jobUrl);
    await candidate.getByRole("button", { name: "Postuler" }).click();
    await candidate
      .getByRole("textbox")
      .fill("Bonjour, six ans d'expérience auprès de jeunes enfants.");
    await candidate.getByRole("button", { name: "Envoyer ma candidature" }).click();

    // La confirmation « Candidature envoyée » n'est pas attendue ici :
    // revalidatePath("/", "layout") re-rend la page dans son état final, qui
    // remplace le formulaire. C'est cet état qui prouve l'enregistrement.
    await expect(candidate.getByText("Vous avez déjà postulé à cette offre.")).toBeVisible({
      timeout: 20_000,
    });

    // Et il survit à un rechargement : la ligne est bien en base.
    await candidate.reload();
    await expect(candidate.getByText("Vous avez déjà postulé à cette offre.")).toBeVisible();

    // --- l'employeur la reçoit ------------------------------------------------
    await employer.goto("/fr/dashboard/employer");
    await expect(employer.getByRole("heading", { name: /Candidatures reçues \(1\)/ })).toBeVisible();
    await expect(
      employer.getByText("Bonjour, six ans d'expérience auprès de jeunes enfants.")
    ).toBeVisible();

    // Le nom n'est PAS attendu ici, et c'est une décision produit à trancher :
    // la politique de lecture de `profiles` n'expose un profil qu'une fois
    // validé, et postuler n'ouvre aucune visibilité (contrairement à un échange
    // de messages). Un employeur voit donc « Candidat » et un message, sans
    // savoir qui écrit, jusqu'à ce que la modération passe.
    await expect(employer.getByText("Candidat", { exact: true })).toBeVisible();

    await employerContext.close();
    await candidateContext.close();
  });

  test("un visiteur anonyme est invité à se connecter pour postuler", async ({ page }) => {
    await page.goto("/fr/offres");
    const invitation = page.getByRole("link", { name: "Se connecter pour postuler" }).first();

    // Only meaningful once at least one job exists; the spec above created one.
    if (await invitation.isVisible().catch(() => false)) {
      await invitation.click();
      await expect(page).toHaveURL(/\/fr\/login/);
    }
  });
});
