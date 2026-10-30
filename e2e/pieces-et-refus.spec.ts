import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  PASSWORD,
  PNG_1x1,
  chooseMetier,
  completeCandidateProfile,
  fillCandidateProfile,
  register,
  saveProfile,
  signIn,
  uniqueEmail,
  uploadIdentityDocuments,
  uploadVia,
} from "./helpers";

/**
 * Pièces justificatives et refus d'un profil (20261028100000_pieces_et_refus.sql).
 *
 * Demandé le 28 octobre 2026 : écarter un candidat avant de le valider, une
 * pièce d'identité obligatoire (recto et verso, une page pour un passeport),
 * et le permis de conduire pour les chauffeurs.
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

/** Numéro congolais valide et unique : 9 chiffres, préfixe mobile. */
function uniquePhone() {
  const suffix = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  return `06${suffix}`;
}

/** Sans chiffres : 9 à la suite passent pour un numéro de téléphone. */
function uniqueName(prefix: string) {
  const letters = String(Date.now()).replace(/\d/g, (digit) => "abcdefghij"[Number(digit)]);
  return `${prefix} ${letters}`;
}

/** Un compte créé par la clé de service ; le rôle admin se pose après coup. */
async function createAccount(role: "admin" | "candidate") {
  const service = serviceClient();
  const email = uniqueEmail(`pieces-${role}`);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: "candidate", full_name: role === "admin" ? "Modération Pièces" : "Autre Candidate" },
  });
  expect(error).toBeNull();
  if (role === "admin") {
    const { error: roleError } = await service
      .from("profiles")
      .update({ role: "admin", is_validated: true })
      .eq("user_id", data.user!.id);
    expect(roleError).toBeNull();
  }
  return email;
}

/** La ligne d'un inscrit dans une section de la modération. */
function rowIn(page: Page, section: string, name: string) {
  return page.locator(`${section} > div > div`).filter({ hasText: name });
}

/** Déplie une section repliée de la modération. */
async function openSection(page: Page, section: string) {
  const details = page.locator(section);
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await details.locator("summary").click();
  }
}

const REDIRECTIONS = [302, 303, 307, 308];

test.describe("pièces justificatives", () => {
  test("un chauffeur envoie sa pièce et son permis, que lui seul et la modération lisent", async ({
    page,
    browser,
  }) => {
    const nom = uniqueName("Rodrigue Volant");
    await register(page, "candidate", nom);
    await fillCandidateProfile(page, uniquePhone());
    await chooseMetier(page, "Chauffeur");
    await saveProfile(page);

    // Le profil enregistré, il manque encore les pièces — permis compris, une
    // fois le métier de chauffeur enregistré.
    const manque = page.locator("strong").filter({ hasText: "Pièce d'identité (recto)" });
    await expect(manque).toContainText("Permis de conduire", { timeout: 20_000 });

    await uploadIdentityDocuments(page);
    await uploadVia(page, "Envoyer le permis", {
      name: "permis.png",
      mimeType: "image/png",
      buffer: PNG_1x1,
    });
    await expect(page.getByRole("button", { name: "Remplacer le permis" })).toBeVisible({
      timeout: 20_000,
    });

    // Plus rien ne manque.
    await page.reload();
    await expect(page.getByText("Complétez votre profil pour continuer")).toHaveCount(0);

    const service = serviceClient();
    const { data: profil } = await service
      .from("profiles")
      .select("id, user_id")
      .eq("full_name", nom)
      .single();
    const { data: pieces } = await service
      .from("candidate_documents")
      .select("identity_type, identity_front, identity_back, driving_license")
      .eq("profile_id", profil!.id)
      .single();
    expect(pieces).toMatchObject({
      identity_type: "cni",
      identity_front: `${profil!.user_id}/identite_recto.png`,
      identity_back: `${profil!.user_id}/identite_verso.png`,
      driving_license: `${profil!.user_id}/permis.png`,
    });
    const adresse = `/api/pieces/${profil!.id}/identity_front`;

    // Le titulaire l'ouvre.
    const parLuiMeme = await page.request.get(adresse, { maxRedirects: 0 });
    expect(REDIRECTIONS).toContain(parLuiMeme.status());
    expect(parLuiMeme.headers()["location"]).toContain("/object/sign/pieces/");

    // Un visiteur, non : ni par l'adresse du site, ni par le stockage.
    const ctxVisiteur = await browser.newContext();
    expect((await ctxVisiteur.request.get(adresse, { maxRedirects: 0 })).status()).toBe(401);
    await ctxVisiteur.close();
    const lien = await anonClient().storage.from("pieces").createSignedUrl(pieces!.identity_front!, 60);
    expect(lien.error).not.toBeNull();

    // Une autre candidate connectée non plus.
    const autre = anonClient();
    const connexion = await autre.auth.signInWithPassword({
      email: await createAccount("candidate"),
      password: PASSWORD,
    });
    expect(connexion.error).toBeNull();
    expect((await autre.storage.from("pieces").createSignedUrl(pieces!.identity_front!, 60)).error)
      .not.toBeNull();
    const { data: fiche } = await autre
      .from("candidate_documents")
      .select("profile_id")
      .eq("profile_id", profil!.id);
    expect(fiche ?? []).toHaveLength(0);
    // Elle ne peut pas non plus faire pointer sa fiche vers la pièce d'un autre.
    const { data: sienne } = await autre
      .from("profiles")
      .select("id")
      .eq("user_id", connexion.data.user!.id)
      .single();
    const detournement = await autre
      .from("candidate_documents")
      .upsert({ profile_id: sienne!.id, identity_front: pieces!.identity_front }, { onConflict: "profile_id" });
    expect(detournement.error).not.toBeNull();
  });
});

test.describe("refus d'un profil", () => {
  test("la modération écarte un candidat avec un motif, il le lit, puis revient en attente", async ({
    browser,
  }) => {
    const nom = uniqueName("Bertille Refus");
    const ctxCandidate = await browser.newContext();
    const candidate = await ctxCandidate.newPage();
    await register(candidate, "candidate", nom);
    await completeCandidateProfile(candidate, uniquePhone());

    const ctxAdmin = await browser.newContext();
    const admin = await ctxAdmin.newPage();
    await signIn(admin, await createAccount("admin"));
    await admin.goto("/fr/admin");
    await openSection(admin, "#inscriptions-non-terminees");
    const row = rowIn(admin, "#inscriptions-non-terminees", nom);

    // Les pièces s'ouvrent depuis la ligne, avant de décider.
    const recto = row.getByRole("link", { name: "Recto" });
    await expect(recto).toBeVisible();
    const ouverture = await admin.request.get((await recto.getAttribute("href"))!, {
      maxRedirects: 0,
    });
    expect(REDIRECTIONS).toContain(ouverture.status());

    // Refuser demande une confirmation, avec un motif facultatif.
    const refuser = row.getByRole("button", { name: "Refuser", exact: true });
    const motif = row.getByLabel(/Motif/);
    await expect(async () => {
      if (await refuser.isVisible()) await refuser.click();
      await expect(motif).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await motif.fill("Pièce d'identité illisible");
    await row.getByRole("button", { name: "Confirmer le refus" }).click();

    // Il quitte la file pour « Refusés », motif affiché.
    await expect(rowIn(admin, "#inscriptions-non-terminees", nom)).toHaveCount(0, {
      timeout: 30_000,
    });
    await openSection(admin, "#refuses");
    const refuse = rowIn(admin, "#refuses", nom);
    await expect(refuse.getByText(/Pièce d'identité illisible/)).toBeVisible();

    // Le candidat le lit sur son tableau de bord, motif compris.
    await candidate.goto("/fr/dashboard/candidate");
    await expect(candidate.getByText("Votre profil n'a pas été retenu par notre équipe")).toBeVisible();
    await expect(candidate.getByText("Pièce d'identité illisible")).toBeVisible();

    // Remis en attente : le refus disparaît des deux côtés.
    await refuse.getByRole("button", { name: "Remettre en attente" }).click();
    await expect(rowIn(admin, "#refuses", nom)).toHaveCount(0, { timeout: 30_000 });
    await candidate.reload();
    await expect(candidate.getByText("Votre profil n'a pas été retenu par notre équipe")).toHaveCount(0);

    await ctxCandidate.close();
    await ctxAdmin.close();
  });
});
