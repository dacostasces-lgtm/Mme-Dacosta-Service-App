import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, uniqueEmail } from "./helpers";

/**
 * Un compte créé par un fournisseur externe n'apporte pas de rôle.
 *
 * Le vrai aller-retour chez Google ne peut pas tourner ici — il demande un
 * client OAuth, un consentement humain et un domaine public. Ce qui est
 * testable, et qui porte tout le risque, c'est l'état dans lequel un tel compte
 * arrive : une ligne `profiles` avec le rôle par défaut et aucun choix
 * enregistré. L'API d'administration produit exactement cet état, puisque le
 * déclencheur d'inscription ne distingue pas d'où vient l'insertion.
 *
 * Sans la porte vérifiée ici, un employeur arrivé par Google serait candidat à
 * vie : `role` est gelé par protect_profile_columns.
 */
test.describe("inscription par un fournisseur externe", () => {
  test("un compte sans rôle choisit le sien avant d'entrer", async ({ page }) => {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const email = uniqueEmail("oauth");
    // Ni `role` ni quartier, et `name` au lieu de `full_name` : la forme des
    // métadonnées que Google renvoie.
    const { error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Google Utilisateur" },
    });
    expect(error).toBeNull();

    await page.goto("/fr/login");
    await page.getByPlaceholder("email@exemple.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();

    // Renvoyé ici quelle que soit la destination demandée : la porte est dans
    // requireUser, pas dans un lien.
    await page.waitForURL(/\/fr\/bienvenue/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Bienvenue, Google Utilisateur/ }))
      .toBeVisible();

    // Le nom vient bien de `name`, pas du début de l'adresse email.
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/^Bienvenue, oauth-/);

    await page.getByText("Je recrute").click();
    await page.getByRole("button", { name: "Continuer" }).click();

    // Employeur, donc espace employeur — et non l'espace candidat où le rôle
    // par défaut l'aurait enfermé.
    await page.waitForURL(/\/fr\/dashboard\/employer/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Mon Espace Employeur" })).toBeVisible();

    // La question ne revient pas, et n'est plus une porte d'entrée.
    await page.goto("/fr/bienvenue");
    await expect(page).toHaveURL(/\/fr\/dashboard\/employer/);
  });
});
