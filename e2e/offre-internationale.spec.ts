import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  PASSWORD,
  PNG_1x1,
  chooseOtherMetier,
  completeCandidateProfile,
  publishProfile,
  register,
  signIn,
  uniqueEmail,
  uploadVia,
} from "./helpers";

/**
 * Offres à l'international (20261124100000_offres_internationales.sql).
 *
 * Demandé le 24 novembre 2026 : l'administration seule publie, gratuitement,
 * une offre pour un placement dans un autre pays ; une candidate publiée y
 * postule avec le CV de son profil et deux références, que l'administration
 * lit dans « Candidatures ».
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

function uniquePhone() {
  return `06${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

/** Un compte créé par la clé de service ; l'administration se pose après coup. */
async function createAccount(role: "admin" | "employer") {
  const service = serviceClient();
  const email = uniqueEmail(`inter-${role}`);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: role === "admin" ? "candidate" : "employer",
      full_name: role === "admin" ? "Modération Internationale" : "Employeur Curieux",
    },
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

async function fillReference(
  page: Page,
  position: number,
  reference: { name: string; relation: string; phone: string; email: string }
) {
  const group = page.getByRole("group", { name: `Référence ${position}` });
  await group.getByLabel("Nom complet").fill(reference.name);
  await group.getByLabel("Qui est-ce pour vous ?").fill(reference.relation);
  await group.getByLabel("Téléphone").fill(reference.phone);
  await group.getByLabel("E-mail").fill(reference.email);
}

test("offre à l'international : l'admin publie, une candidate publiée postule avec CV et références", async ({
  browser,
}) => {
  const service = serviceClient();

  // --- un employeur ne peut pas en publier ------------------------------------
  const employeur = anonClient();
  const employeurEmail = await createAccount("employer");
  expect((await employeur.auth.signInWithPassword({ email: employeurEmail, password: PASSWORD })).error).toBeNull();
  const { data: moi } = await service.from("profiles").select("id").eq("email", employeurEmail).single();
  const fraude = await employeur.from("jobs").insert({
    employer_id: moi!.id,
    title: "Placement au Canada",
    description: "Offre écrite par un employeur, refusée par la base.",
    is_international: true,
    destination_country: "Canada",
  });
  expect(fraude.error).not.toBeNull();

  // --- l'administration publie ------------------------------------------------
  const ctxAdmin = await browser.newContext();
  const admin = await ctxAdmin.newPage();
  await signIn(admin, await createAccount("admin"));
  await admin.goto("/fr/admin");
  await admin.getByRole("link", { name: "Offre à l'international" }).click();
  await admin.waitForURL(/\/fr\/offres\/creer\?international=1/, { timeout: 30_000 });
  await expect(admin.getByLabel("Offre à l'international")).toBeChecked();

  const titre = `Aide familiale ${Date.now().toString(36)}`;
  await chooseOtherMetier(admin, titre);
  await admin
    .getByLabel("Description")
    .fill("Garde de deux enfants et entretien de la maison, contrat de deux ans renouvelable.");
  await admin.getByLabel("Pays de destination").fill("France");
  await admin.getByLabel(/^Ville/).fill("Paris");
  await admin.getByLabel(/^Salaire et avantages/).fill("1 200 € par mois, logé et nourri");
  // Ni quartier ni formule : l'offre est gratuite, et l'agence place.
  await expect(admin.getByLabel("Quartier")).toHaveCount(0);
  await expect(admin.getByText("Formule", { exact: true })).toHaveCount(0);
  await admin.getByRole("button", { name: "Publier l'offre" }).click();
  await admin.waitForURL(/\/fr\/offres$/, { timeout: 30_000 });

  const carte = admin.locator("article").filter({ hasText: titre });
  await expect(carte.getByText("International", { exact: true })).toBeVisible();
  await expect(carte.getByText("Paris, France").first()).toBeVisible();
  await expect(carte.getByText("1 200 € par mois, logé et nourri")).toBeVisible();

  const { data: offre } = await service
    .from("jobs")
    .select("id, is_international, destination_country")
    .eq("title", titre)
    .single();
  expect(offre).toMatchObject({ is_international: true, destination_country: "France" });

  // --- une candidate publiée postule ------------------------------------------
  const ctxCandidate = await browser.newContext();
  const candidate = await ctxCandidate.newPage();
  const nom = uniqueName("Grace Voyageuse");
  const { email } = await register(candidate, "candidate", nom);
  await completeCandidateProfile(candidate, uniquePhone());
  await publishProfile(email);

  await candidate.goto(`/fr/offres/${offre!.id}`);
  await expect(candidate.getByText("Poste à pourvoir : Paris, France")).toBeVisible();
  // Pas de numéro d'employeur à débloquer : c'est l'agence qui place.
  await expect(candidate.getByRole("button", { name: /Débloquer ce numéro/ })).toHaveCount(0);

  const postuler = candidate.getByRole("button", { name: "Postuler avec mon CV et mes références" });
  const ajouterCv = candidate.getByRole("button", { name: "Ajouter mon CV" });
  await expect(async () => {
    if (await postuler.isVisible()) await postuler.click();
    await expect(ajouterCv).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  // Sans CV, l'envoi reste grisé.
  await expect(candidate.getByRole("button", { name: "Envoyer ma candidature" })).toBeDisabled();
  await uploadVia(candidate, "Ajouter mon CV", { name: "cv.png", mimeType: "image/png", buffer: PNG_1x1 });
  await expect(candidate.getByText("Votre CV est joint : celui de votre profil.")).toBeVisible({
    timeout: 20_000,
  });

  await fillReference(candidate, 1, {
    name: "Marie Dupont",
    relation: "Ancienne employeuse",
    phone: "+33 6 12 34 56 78",
    email: "marie.dupont@example.test",
  });
  await fillReference(candidate, 2, {
    name: "Paul Mabiala",
    relation: "Pasteur",
    phone: "06 555 44 33",
    email: "paul.mabiala@example.test",
  });
  await candidate.getByRole("button", { name: "Envoyer ma candidature" }).click();
  await expect(
    candidate.getByText("Candidature envoyée. Notre équipe étudie votre dossier et vous recontacte.")
  ).toBeVisible({ timeout: 20_000 });

  const { data: profil } = await service.from("profiles").select("id").eq("email", email).single();
  const { data: candidature } = await service
    .from("applications")
    .select("id")
    .eq("job_id", offre!.id)
    .eq("candidate_id", profil!.id)
    .single();
  const { data: references } = await service
    .from("application_references")
    .select("position, full_name, email")
    .eq("application_id", candidature!.id)
    .order("position");
  expect(references).toEqual([
    { position: 1, full_name: "Marie Dupont", email: "marie.dupont@example.test" },
    { position: 2, full_name: "Paul Mabiala", email: "paul.mabiala@example.test" },
  ]);

  // --- l'administration lit le dossier ----------------------------------------
  await admin.goto("/fr/admin/candidatures?international=1");
  const ligne = admin.locator("tr").filter({ hasText: nom });
  await expect(ligne.getByText("International · Paris, France")).toBeVisible({ timeout: 30_000 });
  await expect(ligne.getByText("Référence 1 : Marie Dupont")).toBeVisible();
  await expect(ligne.getByText("paul.mabiala@example.test")).toBeVisible();
  const cv = ligne.getByRole("link", { name: "Voir le CV" });
  const ouverture = await admin.request.get((await cv.getAttribute("href"))!, { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(ouverture.status());

  await ctxAdmin.close();
  await ctxCandidate.close();
});
