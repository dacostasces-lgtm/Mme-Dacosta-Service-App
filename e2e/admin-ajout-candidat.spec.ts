import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, uniqueEmail } from "./helpers";

/**
 * La modération saisit elle-même la fiche d'un candidat rencontré hors ligne.
 *
 * C'est le chemin qui remplit la place de marché : beaucoup de candidats ne
 * s'inscriront jamais seuls. Trois choses portent le risque et sont vérifiées
 * ici — le compte se crée malgré `profiles.user_id NOT NULL`, la fiche est
 * publiée sans second passage par la file, et elle ressort dans la recherche
 * publique, donc pour un visiteur anonyme.
 */

/** Numéro congolais valide et unique : 9 chiffres, préfixe mobile. */
function uniquePhone() {
  const suffix = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  return `06${suffix}`;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Un administrateur connecté.
 *
 * Le rôle se pose après coup : `handle_new_user` ne connaît que candidat et
 * employeur, et `protect_profile_columns` gèle ensuite la colonne — seule la
 * clé de service peut l'écrire, ce qui est précisément la protection voulue.
 */
async function createAdmin() {
  const admin = serviceClient();
  const email = uniqueEmail("admin");

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: "candidate", full_name: "Modération Test" },
  });
  expect(error).toBeNull();

  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: "admin", is_validated: true })
    .eq("user_id", data.user!.id);
  expect(roleError).toBeNull();

  return email;
}

test.describe("ajout d'un candidat par la modération", () => {
  test("la fiche saisie est publiée et visible publiquement", async ({ page }) => {
    const email = await createAdmin();
    const nom = `Clarisse Test ${Date.now()}`;
    const phone = uniquePhone();

    await page.goto("/fr/login");
    await page.getByPlaceholder("email@exemple.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();

    // Un admin arrive sur la modération, pas sur un tableau de bord candidat.
    await page.waitForURL(/\/fr\/admin/, { timeout: 30_000 });

    await page.getByRole("link", { name: "Ajouter un candidat" }).click();
    await page.waitForURL(/\/fr\/admin\/candidats\/nouveau/, { timeout: 30_000 });

    await page.getByLabel("Nom complet").fill(nom);
    await page.getByLabel("Téléphone").fill(phone);
    await page.getByLabel("Ville").selectOption({ label: "Brazzaville" });
    await page.getByLabel("Quartier").selectOption({ label: "Bacongo" });
    await page.getByLabel("Métier").fill("Nounou expérimentée");
    await page.getByLabel("Expérience").fill("12 ans");
    await page.getByLabel("Disponibilité").selectOption("full_time");
    await page.getByLabel("Langues parlées").fill("Français, lingala");
    await page.getByLabel("Présentation").fill("Douze ans auprès de familles à Brazzaville.");

    await page.getByRole("button", { name: "Publier le profil" }).click();

    await expect(page.getByRole("heading", { name: new RegExp(`${nom} est en ligne`) }))
      .toBeVisible({ timeout: 30_000 });

    // Le test qui compte : un visiteur anonyme la trouve. Sans `is_validated`
    // posé à la création, la RLS la masquerait et l'écran de succès mentirait.
    const anonyme = await page.context().browser()!.newContext();
    const visiteur = await anonyme.newPage();
    await visiteur.goto(`/fr/candidats?q=${encodeURIComponent(nom)}`);
    await expect(visiteur.getByText(nom)).toBeVisible({ timeout: 30_000 });
    await expect(visiteur.getByText("Nounou expérimentée").first()).toBeVisible();
    await anonyme.close();
  });

  test("un numéro déjà pris est refusé sans créer de doublon", async ({ page }) => {
    const email = await createAdmin();
    const phone = uniquePhone();

    await page.goto("/fr/login");
    await page.getByPlaceholder("email@exemple.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(/\/fr\/admin/, { timeout: 30_000 });

    const saisir = async (nom: string) => {
      await page.goto("/fr/admin/candidats/nouveau");
      await page.getByLabel("Nom complet").fill(nom);
      await page.getByLabel("Téléphone").fill(phone);
      await page.getByLabel("Ville").selectOption({ label: "Brazzaville" });
      await page.getByLabel("Quartier").selectOption({ label: "Bacongo" });
      await page.getByLabel("Métier").fill("Ménagère");
      await page.getByRole("button", { name: "Publier le profil" }).click();
    };

    await saisir(`Première ${Date.now()}`);
    await expect(page.getByRole("heading", { name: /est en ligne/ }))
      .toBeVisible({ timeout: 30_000 });

    // Même numéro : refus explicite, pas une erreur brute de Supabase.
    await saisir(`Seconde ${Date.now()}`);
    await expect(page.getByText(/Un compte existe déjà avec ce numéro/))
      .toBeVisible({ timeout: 30_000 });
  });
});
