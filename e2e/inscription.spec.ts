import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, PNG_1x1, chooseMetier, fillCandidateProfile, uploadVia } from "./helpers";

/**
 * L'inscription en une fois (src/lib/auth/register.ts).
 *
 * Demandé le 20 novembre 2026 : la modération recevait des inscriptions vides,
 * parfois sans numéro. Le bouton « Créer mon compte » reste grisé tant qu'une
 * case manque ; puis vient le code SMS, puis le compte.
 *
 * En test, l'envoi des SMS pointe vers le vide : c'est donc le repli qui est
 * parcouru — le compte se crée sans code, numéro à confirmer par appel —, ce
 * qui vérifie au passage qu'un SMS en panne n'empêche personne de s'inscrire.
 */

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** Un numéro par test et par exécution : un seul compte par numéro. */
function numero(chiffre: number) {
  const suffixe = String(Date.now()).slice(-6);
  return `06${chiffre}${suffixe}`;
}

/** Le formulaire est React : avant qu'il soit prêt, toucher un choix ne fait rien. */
async function chooseRole(page: Page, label: "Je cherche un emploi" | "Je recrute") {
  const button = page.getByRole("button", { name: label });
  await expect(async () => {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

async function fillAccount(page: Page, fullName: string, tel: string) {
  await page.getByLabel("Nom complet").fill(fullName);
  await page.getByLabel("Téléphone").fill(tel);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByLabel("Ville").selectOption({ label: "Brazzaville" });
  await page.getByLabel("Quartier").selectOption({ label: "Bacongo" });
}

/** Le SMS ne part pas en test : la page le dit, et laisse terminer sans code. */
async function finishWithoutCode(page: Page, dashboard: string) {
  const creer = page.getByRole("button", { name: "Créer mon compte" });
  await expect(creer).toBeEnabled();
  await creer.click();
  await expect(page.getByText(/Le SMS n'a pas pu être envoyé/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Terminer mon inscription" }).click();
  await page.waitForURL(new RegExp(`/fr${dashboard}`), { timeout: 30_000 });
}

test.describe("inscription", () => {
  test("un employeur s'inscrit avec son numéro, puis s'y reconnecte", async ({ page }) => {
    const tel = numero(1);
    await page.goto("/fr/register");

    const creer = page.getByRole("button", { name: "Créer mon compte" });
    await expect(creer).toBeDisabled();

    await chooseRole(page, "Je recrute");
    await fillAccount(page, "Famille Inscrite", tel);

    // Un numéro mal tapé grise le bouton autant qu'une case vide.
    await page.getByLabel("Téléphone").fill("0612");
    await expect(creer).toBeDisabled();
    await expect(page.getByText(/Il manque encore : .*Téléphone/)).toBeVisible();
    await page.getByLabel("Téléphone").fill(tel);

    await finishWithoutCode(page, "/dashboard/employer");
    await expect(page.getByRole("heading", { name: "Mon Espace Employeur" })).toBeVisible();

    // Le vrai test : un compte sans email doit pouvoir se reconnecter.
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL(/\/fr$/, { timeout: 30_000 });
    await page.goto("/fr/login");
    await page.getByLabel("Email ou numéro de téléphone").fill(tel);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(/\/fr\/(verification|dashboard)/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  });

  test("une candidate remplit tout, pièces comprises, avant que le compte existe", async ({
    page,
  }) => {
    const tel = numero(2);
    await page.goto("/fr/register");
    await chooseRole(page, "Je cherche un emploi");

    const creer = page.getByRole("button", { name: "Créer mon compte" });
    await expect(creer).toBeDisabled();

    // Chauffeur : le permis devient obligatoire.
    await chooseMetier(page, "Chauffeur");
    await expect(page.getByRole("button", { name: "Choisir le permis" })).toBeVisible();
    await expect(page.getByText(/Il manque encore : .*Permis de conduire/)).toBeVisible();

    await page.getByLabel("Nom complet").fill("Awa Inscrite");
    await page.getByLabel("Mot de passe").fill(PASSWORD);
    await page.getByLabel("Ville").selectOption({ label: "Brazzaville" });
    await page.getByLabel("Quartier").selectOption({ label: "Bacongo" });
    // Toutes les cases du profil, métier Nounou compris (le permis disparaît).
    await fillCandidateProfile(page, tel);
    await expect(page.getByRole("button", { name: "Choisir le permis" })).toHaveCount(0);

    // Sans pièce d'identité, toujours grisé.
    await expect(creer).toBeDisabled();
    await page.getByLabel("Type de pièce d'identité").selectOption("cni");
    await uploadVia(page, "Choisir le recto", {
      name: "recto.png",
      mimeType: "image/png",
      buffer: PNG_1x1,
    });
    await expect(page.getByText(/Il manque encore : .*verso/)).toBeVisible();
    await expect(creer).toBeDisabled();
    await uploadVia(page, "Choisir le verso", {
      name: "verso.png",
      mimeType: "image/png",
      buffer: PNG_1x1,
    });

    await finishWithoutCode(page, "/dashboard/candidate");

    // Le compte est né complet : profil, adresse, pièces. Numéro à confirmer
    // par appel, puisque le SMS n'est pas parti.
    const service = serviceClient();
    const { data: profil } = await service
      .from("profiles")
      .select("id, phone, phone_verified_at, neighborhood_id")
      .eq("phone", `+242 ${tel.slice(0, 2)} ${tel.slice(2, 5)} ${tel.slice(5, 7)} ${tel.slice(7)}`)
      .single();
    expect(profil).not.toBeNull();
    expect(profil!.phone_verified_at).toBeNull();
    expect(profil!.neighborhood_id).not.toBeNull();

    const { data: details } = await service
      .from("candidate_details")
      .select("job_title, age, marital_status, skills, work_days")
      .eq("profile_id", profil!.id)
      .single();
    expect(details).toMatchObject({ job_title: "Nounou", age: 32, marital_status: "marie" });
    expect(details!.skills).toHaveLength(3);

    const { data: adresse } = await service
      .from("candidate_addresses")
      .select("address")
      .eq("profile_id", profil!.id)
      .single();
    expect(adresse!.address).toContain("rue Mbochi");

    const { data: pieces } = await service
      .from("candidate_documents")
      .select("identity_type, identity_front, identity_back")
      .eq("profile_id", profil!.id)
      .single();
    expect(pieces!.identity_type).toBe("cni");
    expect(pieces!.identity_front).toMatch(/identite_recto\.png$/);
    expect(pieces!.identity_back).toMatch(/identite_verso\.png$/);

    // Profil complet : son espace ne réclame plus rien.
    await page.goto("/fr/profil");
    await expect(page.getByText("Complétez votre profil pour continuer")).toHaveCount(0);
  });

  test("un numéro déjà inscrit est refusé avant tout envoi de SMS", async ({ page }) => {
    const tel = numero(3);
    const service = serviceClient();
    const { error } = await service.auth.admin.createUser({
      phone: `+242${tel}`,
      password: PASSWORD,
      phone_confirm: true,
      user_metadata: {
        role: "employer",
        full_name: "Famille Premiere",
        phone: `+242 ${tel.slice(0, 2)} ${tel.slice(2, 5)} ${tel.slice(5, 7)} ${tel.slice(7)}`,
      },
    });
    expect(error).toBeNull();

    await page.goto("/fr/register");
    await chooseRole(page, "Je recrute");
    await fillAccount(page, "Famille Seconde", tel);
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.getByText(/Un compte existe déjà avec ce numéro/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Terminer mon inscription" })).toHaveCount(0);
  });
});
