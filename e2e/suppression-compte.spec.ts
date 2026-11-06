import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, PNG_1x1, register } from "./helpers";

/**
 * Supprimer son compte soi-même (20261106100000_suppression_compte.sql).
 *
 * Demandé le 6 novembre 2026 : rien ne permettait à un inscrit de partir.
 * Le profil reste, vidé, parce que des paiements y renvoient ; ce que la
 * suppression doit garder est vérifié en SQL, ce qu'elle doit effacer ici.
 */

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

/** Sans chiffres : 9 à la suite passent pour un numéro de téléphone. */
function uniqueName(prefix: string) {
  const letters = String(Date.now()).replace(/\d/g, (digit) => "abcdefghij"[Number(digit)]);
  return `${prefix} ${letters}`;
}

test("une candidate supprime son compte, puis peut revenir avec la même adresse", async ({ page }) => {
  const nom = uniqueName("Clemence Depart");
  const { email } = await register(page, "candidate", nom);

  // Un fichier dans son dossier, déposé comme le fait le profil : la
  // suppression doit le retirer du seau.
  const elle = anonClient();
  const connexion = await elle.auth.signInWithPassword({ email, password: PASSWORD });
  expect(connexion.error).toBeNull();
  const userId = connexion.data.user!.id;
  const depot = await elle.storage
    .from("avatars")
    .upload(`${userId}/avatar.png`, PNG_1x1, { contentType: "image/png", upsert: true });
  expect(depot.error).toBeNull();

  const service = serviceClient();
  const { data: profil } = await service.from("profiles").select("id").eq("user_id", userId).single();

  // Deux gestes : ouvrir, puis écrire SUPPRIMER.
  await page.goto("/fr/profil");
  const ouvrir = page.getByRole("button", { name: "Supprimer mon compte", exact: true });
  const confirmation = page.getByLabel(/Pour confirmer, écrivez SUPPRIMER/);
  await expect(async () => {
    if (await ouvrir.isVisible()) await ouvrir.click();
    await expect(confirmation).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  const definitif = page.getByRole("button", { name: "Supprimer définitivement" });
  await expect(definitif).toBeDisabled();
  await confirmation.fill("supprimer");
  await definitif.click();

  await page.waitForURL(/\/fr\/compte-supprime/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Votre compte a été supprimé" })).toBeVisible();

  // Le profil reste, vidé, et ses fichiers sont partis.
  const { data: apres } = await service
    .from("profiles")
    .select("full_name, phone, avatar_url, deleted_at")
    .eq("id", profil!.id)
    .single();
  expect(apres).toMatchObject({ full_name: "Compte supprimé", phone: null, avatar_url: null });
  expect(apres!.deleted_at).not.toBeNull();
  const { data: fichiers } = await service.storage.from("avatars").list(userId);
  expect(fichiers ?? []).toHaveLength(0);

  // Plus de connexion : ni par la session du navigateur, ni par le mot de passe.
  await page.goto("/fr/profil");
  await expect(page).toHaveURL(/\/fr\/login/);
  expect((await anonClient().auth.signInWithPassword({ email, password: PASSWORD })).error).not.toBeNull();

  // L'adresse est libérée : elle peut se réinscrire.
  await register(page, "candidate", uniqueName("Clemence Retour"), email);
});
