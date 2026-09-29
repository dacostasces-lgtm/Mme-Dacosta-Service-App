import { expect, test } from "@playwright/test";
import { PASSWORD, registerByPhone } from "./helpers";

/**
 * Inscription sans adresse email.
 *
 * C'est le parcours qui compte le plus pour ce produit : beaucoup de
 * candidates n'ont pas d'email, ou n'y accèdent jamais. Un compte créé ainsi
 * doit pouvoir se reconnecter — sinon on fabrique des comptes perdus.
 */
test.describe("inscription par numéro", () => {
  // Un numéro par exécution : Supabase refuse un second compte sur le même.
  const numero = () => {
    const suffixe = String(Date.now()).slice(-6);
    return `06${suffixe.slice(0, 3)}${suffixe.slice(3)}0`.slice(0, 9);
  };

  test("créer un compte avec un numéro, puis s'y reconnecter", async ({ page }) => {
    const tel = numero();
    await registerByPhone(page, "candidate", "Awa Sans Email", tel);

    await expect(page.getByRole("heading", { name: "Mon Espace Candidat" })).toBeVisible();

    // La déconnexion puis reconnexion est le vrai test : c'est là qu'un compte
    // sans email devient inaccessible si la connexion ne l'accepte pas.
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL(/\/fr$/, { timeout: 30_000 });

    await page.goto("/fr/login");
    await page.getByLabel("Email ou numéro de téléphone").fill(tel);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();

    // Le numéro n'étant pas vérifié, la porte renvoie vers l'étape — ce qui
    // prouve que la connexion a bien réussi.
    await page.waitForURL(/\/fr\/(verification|dashboard)/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  });

  test("le formulaire exige l'un des deux, pas les deux", async ({ page }) => {
    await page.goto("/fr/register");

    // Par défaut le numéro est proposé : aucun champ email n'est affiché.
    await expect(page.getByLabel("Téléphone")).toBeVisible();
    await expect(page.getByPlaceholder("email@exemple.com")).toHaveCount(0);

    await page.getByRole("button", { name: "Mon email" }).click();
    await expect(page.getByPlaceholder("email@exemple.com")).toBeVisible();
    await expect(page.getByLabel("Téléphone")).toHaveCount(0);
  });
});
