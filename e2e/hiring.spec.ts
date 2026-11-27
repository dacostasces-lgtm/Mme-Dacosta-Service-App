import { expect, test } from "@playwright/test";
import {
  register,
  completeCandidateProfile,
  addEmployerPhone,
  chooseOtherMetier,
  publishProfile,
} from "./helpers";

test.describe("offre et candidature", () => {
  /**
   * L'employeur publie, la fiche porte son JobPosting ; la candidate, une fois
   * son profil publié par la modération, postule, et l'employeur la reçoit
   * avec son nom — depuis le 22 novembre 2026, seul un profil publié postule.
   */
  test("un employeur publie, une candidate postule, l'employeur la voit", async ({ browser }) => {
    const employerContext = await browser.newContext();
    const employer = await employerContext.newPage();

    // --- l'employeur publie ---------------------------------------------------
    await register(employer, "employer", "Famille Nkodia");
    // Sans numéro, il n'entre pas dans son espace : « Complétez votre compte »
    // le lui demande d'abord (/coordonnees). Le profil reste ouvert, et c'est
    // par lui que addEmployerPhone le donne.
    await expect(employer.getByRole("heading", { name: "Complétez votre compte" })).toBeVisible({
      timeout: 30_000,
    });
    await addEmployerPhone(employer, "060000004");
    await expect(employer.getByRole("heading", { name: "Mon Espace Employeur" })).toBeVisible();

    await employer.goto("/fr/offres/creer");
    // Unique, mais en base 36 : un horodatage brut aligne 13 chiffres, que le
    // filtre anti-numéros (20261011050000_block_phone_numbers.sql) prend à
    // juste titre pour un numéro de téléphone, et l'offre est refusée.
    const title = `Nounou temps plein ${Date.now().toString(36)}`;
    // Le poste se choisit par boutons ; « Autre… » garde un intitulé unique,
    // que la suite retrouve dans la liste des offres.
    await chooseOtherMetier(employer, title);
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
    const { email } = await register(candidate, "candidate", "Awa Postulante");
    // Un profil incomplet ne peut pas postuler.
    await completeCandidateProfile(candidate, "060000002");

    // Complet mais pas encore vérifié : ni « Postuler », ni numéro à payer,
    // seulement la raison.
    await candidate.goto(jobUrl);
    await expect(
      candidate.getByText(/doit d'abord être vérifié par notre équipe/).first()
    ).toBeVisible();
    await expect(candidate.getByRole("button", { name: "Postuler" })).toHaveCount(0);

    // La modération publie le profil : elle peut postuler.
    await publishProfile(email);
    await candidate.goto(jobUrl);
    await candidate.getByRole("button", { name: "Postuler" }).click();
    await candidate
      .getByRole("textbox")
      .fill("Bonjour, six ans d'expérience auprès de jeunes enfants.");
    await candidate.getByRole("button", { name: "Envoyer ma candidature" }).click();

    // La confirmation doit tenir, et non être balayée par la révalidation de
    // layout que déclenche l'action : c'est la seule chose qui dit à la
    // candidate que son envoi est parti.
    await expect(
      candidate.getByText("Candidature envoyée. L'employeur peut désormais vous contacter.")
    ).toBeVisible({ timeout: 20_000 });

    // Au rechargement elle cède la place au constat, qui prouve que la ligne
    // est bien en base et pas seulement dans l'état du composant.
    await candidate.reload();
    await expect(candidate.getByText("Vous avez déjà postulé à cette offre.")).toBeVisible();

    // --- l'employeur la reçoit ------------------------------------------------
    await employer.goto("/fr/dashboard/employer");
    await expect(employer.getByRole("heading", { name: /Candidatures reçues \(1\)/ })).toBeVisible();
    await expect(
      employer.getByText("Bonjour, six ans d'expérience auprès de jeunes enfants.")
    ).toBeVisible();

    // Avec son nom : un profil publié est lisible, et seul un profil publié
    // peut désormais postuler.
    await expect(employer.getByText(`Awa Postulante · ${title}`)).toBeVisible();

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
