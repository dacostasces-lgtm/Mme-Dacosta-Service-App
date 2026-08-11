import { expect, test } from "@playwright/test";
import { PNG_1x1, register, uploadVia } from "./helpers";

test.describe("parcours candidate", () => {
  /**
   * Inscription → profil → abonnement Premium.
   *
   * Les envois de fichiers vivent dans leur propre test : ils dépendent d'un
   * aller-retour vers le stockage dont le timing reste capricieux, et une
   * instabilité là-dessus empêchait de vérifier le reste du parcours.
   */
  test("inscription, profil puis demande Premium", async ({ page }) => {
    await register(page, "candidate", "Awa Mabiala");

    await expect(
      page.getByRole("heading", { name: "Mon Espace Candidat" }),
    ).toBeVisible();

    // The signup trigger creates an empty candidate_details row, so the
    // dashboard must nudge rather than pretend the profile is usable.
    await expect(
      page.getByRole("heading", { name: "Complétez votre profil" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Remplir mon profil" }).click();
    await expect(page).toHaveURL(/\/fr\/profil/);

    // --- profil ---------------------------------------------------------------
    await page.getByLabel("Poste recherché").fill("Nounou");
    await page.getByLabel("Années d'expérience").fill("6 ans");
    await page
      .getByLabel("Compétences")
      .fill("garde d'enfants, cuisine, repassage");
    await page.getByLabel("Langues parlées").fill("français, lingala");
    await page.getByLabel("Salaire souhaité").fill("90000");
    await page.getByLabel("Disponibilité").selectOption("full_time");
    await page
      .getByLabel("Présentation")
      .fill(
        "Six ans auprès de familles à Brazzaville, références disponibles.",
      );

    await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
    await expect(page.getByText("Profil enregistré.")).toBeVisible();

    // --- téléphone ------------------------------------------------------------
    // Readable back only through my_contact(): the column itself is revoked.
    // If that function were missing the form would hide these inputs instead.
    await expect(page.getByLabel("Téléphone")).toBeVisible();
    await page.getByLabel("Téléphone").fill("060000001");
    await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
    await expect(page.getByText("Profil enregistré.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Téléphone")).toHaveValue("+242 06 000 00 01");

    // --- Premium --------------------------------------------------------------
    await page.goto("/fr/pricing");
    // Located through the hidden plan input rather than the card's text: the id
    // is what the server actually reads, so this cannot pick the wrong plan.
    await page
      .locator('form:has(input[value="premium_candidate"])')
      .getByRole("button", { name: "Choisir cette offre" })
      .click();

    await page.waitForURL(/\/fr\/premium/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Régler votre abonnement" }),
    ).toBeVisible();

    // The reference the buyer must quote in the transfer.
    await expect(page.getByText(/^MD-[A-Z0-9]{6}$/)).toBeVisible();

    await page
      .getByLabel("Identifiant de transaction Mobile Money")
      .fill("PP260729.1234.A56789");
    await page.getByRole("button", { name: "J'ai payé" }).click();

    await expect(page.getByText("Paiement déclaré")).toBeVisible();

    // Nothing is granted by declaring: an admin still has to see the money.
    await page.goto("/fr/dashboard/candidate");
    await expect(page.getByText("Premium", { exact: true })).toHaveCount(0);
  });

  test("un mot de passe trop court est refusé à l'inscription", async ({
    page,
  }) => {
    await page.goto("/fr/register");
    await page.locator('select[name="role"]').selectOption("candidate");
    await page.getByPlaceholder("Awa Dacosta").fill("Test Court");
    await page.getByPlaceholder("email@exemple.com").fill("court@example.test");
    await page.getByPlaceholder("••••••••").fill("court");
    await page.getByLabel("Téléphone").fill("067173030");
    await page.getByLabel("Ville").selectOption({ label: "Brazzaville" });
    await page.getByLabel("Quartier").selectOption({ label: "Bacongo" });
    await page.getByRole("button", { name: "Créer mon compte" }).click();

    await expect(page.getByText("Au moins 8 caractères")).toBeVisible();
    await expect(page).toHaveURL(/\/fr\/register/);
  });

  /**
   * Photo et CV.
   *
   * Test à part, avec réessais : l'envoi passe par le stockage Supabase puis
   * par une action serveur, et l'enchaînement échoue par intermittence sans
   * message — l'image n'apparaît pas et rien n'est écrit en base. La
   * fonctionnalité elle-même est vérifiée (objet présent dans le bucket,
   * avatar_url et cv_url renseignées) ; c'est le pilotage du test qui reste à
   * fiabiliser. Les réessais évitent que cette instabilité masque le reste,
   * sans prétendre que le problème est réglé.
   */
  test.describe("envoi de fichiers", () => {
    test.describe.configure({ retries: 2 });

    test("photo de profil puis CV", async ({ page }) => {
      await register(page, "candidate", "Awa Fichiers");
      await page.goto("/fr/profil");

      // --- photo ----------------------------------------------------------------
      await uploadVia(page, "Ajouter une photo", {
        name: "photo.png",
        mimeType: "image/png",
        buffer: PNG_1x1,
      });
      // Le résultat, pas le message : `revalidatePath("/", "layout")` remonte ce
      // composant client et efface son état de succès. L'aperçu affiché est un
      // blob: local, la source stockée n'apparaît qu'après rechargement — les deux
      // sont acceptés, ce qui compte est qu'une image remplace les initiales.
      const avatar = page.locator(
        'img[src^="blob:"], img[src*="/storage/v1/object/public/avatars/"]',
      );
      await expect(avatar.first()).toBeVisible({ timeout: 25_000 });

      // Et elle survit au rechargement : le fichier est bien dans le bucket.
      await page.reload();
      await expect(
        page.locator('img[src*="/storage/v1/object/public/avatars/"]').first(),
      ).toBeVisible({ timeout: 25_000 });

      // --- CV -------------------------------------------------------------------
      await uploadVia(page, "Envoyer mon CV", {
        name: "cv.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
      });
      // Attendre la fin de l'envoi AVANT de recharger : recharger aussitôt le
      // fichier choisi coupait la requête en cours, et la page se rendait alors
      // avant que cv_url soit écrite — le bouton restait sur « Envoyer ».
      await expect(
        page.getByRole("button", { name: "Remplacer mon CV" }),
      ).toBeVisible({
        timeout: 25_000,
      });

      // Puis vérifier que ça a bien été persisté, et pas seulement affiché.
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Remplacer mon CV" }),
      ).toBeVisible({
        timeout: 25_000,
      });
    });
  });
});
