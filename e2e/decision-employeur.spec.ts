import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, signIn, uniqueEmail } from "./helpers";

/**
 * L'administration décide pour un compte employeur comme pour un candidat :
 * publier, ou refuser.
 *
 * Signalé le 30 octobre 2026, capture à l'appui : une carte employeur dans
 * « En attente » ne portait qu'un seul bouton — « Publier » — et ne disait rien
 * de son état, ni complet ni incomplet. Deux défauts distincts :
 *
 *   - le bouton « Refuser » était conditionné au rôle candidat dans
 *     l'interface, alors que `reject_profile` accepte depuis toujours tout
 *     profil non administrateur ;
 *   - le bloc d'état n'était rendu que pour les candidats, de sorte qu'une
 *     carte employeur restait muette.
 *
 * Et la règle elle-même a changé : un employeur doit porter un numéro confirmé
 * *et* un quartier, au lieu du seul numéro.
 */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** La ligne d'un inscrit dans une section de la modération. */
function rowIn(page: Page, section: "#profils" | "#inscriptions-non-terminees", name: string) {
  return page.locator(`${section} > div > div`).filter({ hasText: name });
}

/** Déplie les inscriptions non terminées, repliées par défaut. */
async function openUnfinished(page: Page) {
  const section = page.locator("#inscriptions-non-terminees");
  if (!(await section.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await section.locator("summary").click();
  }
}

/** Un nom unique sans chiffres : treize chiffres passeraient pour un numéro,
 *  et `reject_phone_numbers` refuserait d'enregistrer le profil. */
function uniqueName(prefix: string) {
  const letters = String(Date.now()).replace(/\d/g, (digit) => "abcdefghij"[Number(digit)]);
  return `${prefix} ${letters}`;
}

async function createAccount(role: "admin" | "employer", fullName: string) {
  const admin = serviceClient();
  const email = uniqueEmail(`decision-${role}`);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: role === "admin" ? "candidate" : role, full_name: fullName },
  });
  expect(error).toBeNull();

  if (role === "admin") {
    const { error: roleError } = await admin
      .from("profiles")
      .update({ role: "admin", is_validated: true })
      .eq("user_id", data.user!.id);
    expect(roleError).toBeNull();
  }
  const { data: profil } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", data.user!.id)
    .single();

  return { email, profileId: profil!.id as string };
}

test.describe("décision de l'administration sur un employeur", () => {
  test("un employeur sans quartier attend, puis se publie ou se refuse", async ({ browser }) => {
    const service = serviceClient();
    const nom = uniqueName("Famille Decision");
    const employeur = await createAccount("employer", nom);

    // Numéro confirmé, pas de quartier : l'ancienne règle l'aurait déclaré
    // complet, la nouvelle non.
    await service
      .from("profiles")
      .update({
        phone: "+242 06 111 22 33",
        phone_verified_at: new Date().toISOString(),
        neighborhood_id: null,
      })
      .eq("id", employeur.profileId);

    const ctxAdmin = await browser.newContext();
    const admin = await ctxAdmin.newPage();
    await signIn(admin, (await createAccount("admin", "Modération Decision")).email);
    await admin.goto("/fr/admin");

    // --- il n'attend pas de décision : il lui manque le quartier --------------
    await expect(rowIn(admin, "#profils", nom)).toHaveCount(0);
    await openUnfinished(admin);
    const incomplet = rowIn(admin, "#inscriptions-non-terminees", nom);
    await expect(incomplet.getByText(/Compte incomplet — manque : Quartier/)).toBeVisible();
    await expect(incomplet.getByRole("button", { name: "Publier", exact: true })).toHaveCount(0);
    // Mais il se refuse : c'est tout l'objet du signalement.
    await expect(incomplet.getByRole("button", { name: "Refuser" })).toBeVisible();

    // --- le quartier renseigné, il passe en attente avec les deux boutons -----
    const { data: quartier } = await service.from("neighborhoods").select("id").limit(1).single();
    await service
      .from("profiles")
      .update({ neighborhood_id: quartier!.id })
      .eq("id", employeur.profileId);

    await admin.reload();
    const enAttente = rowIn(admin, "#profils", nom);
    await expect(enAttente).toHaveCount(1, { timeout: 30_000 });
    // La carte dit son état, au lieu de rester muette.
    await expect(enAttente.getByText("Compte complet", { exact: true })).toBeVisible();
    await expect(enAttente.getByRole("button", { name: "Publier", exact: true })).toBeVisible();
    await expect(enAttente.getByRole("button", { name: "Refuser" })).toBeVisible();

    // --- l'administration refuse, avec un motif ------------------------------
    await enAttente.getByRole("button", { name: "Refuser" }).click();
    await enAttente.getByLabel(/Motif/).fill("Compte créé pour essayer, sans projet de recrutement");
    await enAttente.getByRole("button", { name: "Confirmer le refus" }).click();
    await expect(rowIn(admin, "#profils", nom)).toHaveCount(0, { timeout: 30_000 });

    // --- et l'employeur lit pourquoi -----------------------------------------
    // Sans cela il serait écarté sans jamais savoir, et continuerait de se
    // demander pourquoi ses offres ne partent pas.
    const ctxEmployeur = await browser.newContext();
    const page = await ctxEmployeur.newPage();
    await signIn(page, employeur.email);
    await page.goto("/fr/dashboard/employer");
    await expect(page.getByText("Votre compte n'a pas été retenu par notre équipe")).toBeVisible();
    await expect(page.getByText(/sans projet de recrutement/)).toBeVisible();

    await ctxAdmin.close();
    await ctxEmployeur.close();
  });
});
