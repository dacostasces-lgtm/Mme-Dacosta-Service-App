import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, randomStoredPhone, signIn, uniqueEmail } from "./helpers";

/**
 * « Complétez votre compte » (/coordonnees).
 *
 * Demandé le 27 novembre 2026 : un employeur inscrit avant que le numéro et le
 * quartier soient obligatoires voyait un bandeau les lui réclamer, mais
 * continuait sans eux. Il les donne désormais avant d'entrer dans son espace.
 */

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** Un ancien employeur : ni numéro ni quartier, comme avant le 26 novembre. */
async function ancienEmployeur(profil: Record<string, unknown> = {}) {
  const service = serviceClient();
  const email = uniqueEmail("coordonnees");
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: "employer", full_name: "Famille Ancienne" },
  });
  expect(error).toBeNull();
  const query = service.from("profiles");
  const { data: row, error: updateError } = await (Object.keys(profil).length > 0
    ? query.update(profil).eq("user_id", data.user!.id).select("id").single()
    : query.select("id").eq("user_id", data.user!.id).single());
  expect(updateError).toBeNull();
  return { email, profileId: row!.id as string };
}

test.describe("un employeur sans numéro ou sans quartier", () => {
  test("les donne avant d'entrer dans son espace", async ({ page }) => {
    const employeur = await ancienEmployeur();
    const numero = `06${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

    await signIn(page, employeur.email);
    await page.waitForURL(/\/fr\/coordonnees/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Complétez votre compte" })).toBeVisible();

    // Son espace, la publication d'une offre, la messagerie : tout y ramène.
    for (const chemin of ["/fr/dashboard/employer", "/fr/offres/creer", "/fr/messages"]) {
      await page.goto(chemin);
      await page.waitForURL(/\/fr\/coordonnees/, { timeout: 30_000 });
    }

    // Le profil reste ouvert, avec de quoi supprimer son compte : la porte
    // n'enferme personne.
    await page.goto("/fr/profil#supprimer-mon-compte");
    await expect(page).toHaveURL(/\/fr\/profil/);
    await expect(page.getByRole("button", { name: "Supprimer mon compte" })).toBeVisible({
      timeout: 30_000,
    });

    // Le bouton reste grisé tant que le numéro et le quartier manquent.
    await page.goto("/fr/coordonnees");
    const continuer = page.getByRole("button", { name: "Continuer" });
    await expect(continuer).toBeDisabled();
    await page.getByLabel("Téléphone").fill("0612");
    await expect(page.getByText(/9 chiffres/)).toBeVisible();
    await page.getByLabel("Téléphone").fill(numero);
    await page.getByLabel("Ville").selectOption({ label: "Brazzaville" });
    await expect(continuer).toBeDisabled();
    await page.getByLabel("Quartier").selectOption({ label: "Bacongo" });
    await expect(continuer).toBeEnabled();
    await continuer.click();

    // Le numéro tout juste donné passe par le code SMS, franchi par la porte
    // de secours (l'envoi pointe vers le vide en test).
    await page.waitForURL(/\/fr\/verification/, { timeout: 30_000 });
    await page.getByRole("button", { name: /Recevoir mon code/ }).click();
    await page.getByRole("button", { name: "Continuer sans vérifier" }).click({ timeout: 30_000 });
    await page.waitForURL(/\/fr\/dashboard\/employer/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Mon Espace Employeur" })).toBeVisible();

    const { data: profil } = await serviceClient()
      .from("profiles")
      .select("phone, neighborhood_id")
      .eq("id", employeur.profileId)
      .single();
    expect(profil!.phone).toBe(
      `+242 ${numero.slice(0, 2)} ${numero.slice(2, 5)} ${numero.slice(5, 7)} ${numero.slice(7)}`
    );
    expect(profil!.neighborhood_id).not.toBeNull();

    // Complet, il n'est plus arrêté.
    await page.goto("/fr/coordonnees");
    await page.waitForURL(/\/fr\/dashboard\/employer/, { timeout: 30_000 });
  });

  test("avec un numéro confirmé, seul le quartier est demandé", async ({ page }) => {
    const employeur = await ancienEmployeur({
      phone: randomStoredPhone(),
      phone_verified_at: new Date().toISOString(),
    });

    await signIn(page, employeur.email);
    await page.waitForURL(/\/fr\/coordonnees/, { timeout: 30_000 });
    await expect(page.getByLabel("Téléphone")).toHaveCount(0);

    const continuer = page.getByRole("button", { name: "Continuer" });
    await expect(continuer).toBeDisabled();
    await page.getByLabel("Ville").selectOption({ label: "Brazzaville" });
    await page.getByLabel("Quartier").selectOption({ label: "Bacongo" });
    await expect(continuer).toBeEnabled();
    await continuer.click();

    // Numéro déjà confirmé : directement dans son espace.
    await page.waitForURL(/\/fr\/dashboard\/employer/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Mon Espace Employeur" })).toBeVisible();
  });
});
