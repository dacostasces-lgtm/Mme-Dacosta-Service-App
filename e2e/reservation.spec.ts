import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  PASSWORD,
  addEmployerPhone,
  ouvrirVirementManuel,
  register,
  uniqueEmail,
} from "./helpers";

/**
 * La fiche candidat vue par ceux qui paient, et par ceux qui ne doivent rien
 * y acheter.
 *
 * Le parcours « réserver ce candidat » n'est plus ici : la réservation a quitté
 * la grille tarifaire (40c568d), avec son bouton et la page /reserver. Le
 * numéro d'un candidat se paie désormais depuis sa fiche, plus bas.
 */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** Un candidat publié, sans quoi il n'apparaît ni en recherche ni en fiche. */
async function candidatPublie(nom: string, telephone?: string) {
  const admin = serviceClient();
  const email = uniqueEmail("cand");

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: "candidate", full_name: nom },
  });
  expect(error).toBeNull();

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", data.user!.id)
    .single();

  await admin
    .from("profiles")
    .update({ is_validated: true, ...(telephone ? { phone: telephone } : {}) })
    .eq("id", profile!.id);
  await admin
    .from("candidate_details")
    .update({ job_title: "Nounou", availability: "full_time" })
    .eq("profile_id", profile!.id);

  return { profileId: profile!.id as string, email };
}

test.describe("réservation d'un candidat", () => {
  test("un candidat ne se voit pas proposer de réserver un autre candidat", async ({ page }) => {
    const telephone = numeroDeTest();
    const { profileId } = await candidatPublie(`Autre ${Date.now()}`, telephone);
    await register(page, "candidate", "Candidate Curieuse");

    await page.goto(`/fr/candidats/${profileId}`);
    // Le tunnel exige le rôle employeur : afficher le bouton le renverrait vers
    // son propre tableau de bord, ce qui se lit comme une panne.
    await expect(page.getByRole("link", { name: "Réserver ce candidat" })).toHaveCount(0);
    // Le numéro d'un candidat ne se vend qu'aux employeurs.
    await expect(page.getByRole("button", { name: /Payer pour avoir le numéro/ })).toHaveCount(0);
    await expect(page.getByText(telephone)).toHaveCount(0);
  });
});

test.describe("filtre métier de la recherche", () => {
  test("le bouton du métier retrouve le candidat, un autre métier l'écarte", async ({ page }) => {
    // candidatPublie pose « Nounou » comme métier.
    const nom = `Candidate Filtre ${Date.now()}`;
    await candidatPublie(nom);

    await page.goto(`/fr/candidats?metier=${encodeURIComponent("Nounou")}`);
    await expect(page.getByText(nom)).toBeVisible({ timeout: 30_000 });

    await page.goto(`/fr/candidats?metier=${encodeURIComponent("Chauffeur")}`);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    await expect(page.getByText(nom)).toHaveCount(0);

    // Avec une saisie en plus, le métier filtre encore l'intitulé.
    await page.goto(
      `/fr/candidats?q=${encodeURIComponent(nom)}&metier=${encodeURIComponent("Chauffeur")}`
    );
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    await expect(page.getByText(nom)).toHaveCount(0);
  });
});

/** Un numéro à neuf chiffres, différent à chaque essai. */
function numeroDeTest() {
  return `06${String(Date.now()).slice(-7)}`;
}

test.describe("numéro d'un candidat sur sa fiche", () => {
  test("l'employeur paie le numéro, la modération valide, le numéro s'affiche", async ({
    page,
  }) => {
    const telephone = numeroDeTest();
    const { profileId } = await candidatPublie(`Candidate Numéro ${Date.now()}`, telephone);

    // Le bouton « Contacter » menait à une messagerie vide : il a laissé la
    // place au numéro, ou au moyen de l'obtenir.
    await page.goto(`/fr/candidats/${profileId}`);
    await expect(page.getByRole("link", { name: "Contacter" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Se connecter pour avoir le numéro" })).toBeVisible();

    await register(page, "employer", "Famille Numéro");
    await addEmployerPhone(page, "060000005");

    await page.goto(`/fr/candidats/${profileId}`);
    await expect(page.getByText(telephone)).toHaveCount(0);
    await page.getByRole("button", { name: /Payer pour avoir le numéro/ }).click();

    await expect(
      page.getByRole("heading", { name: "Régler le numéro du candidat" })
    ).toBeVisible({ timeout: 30_000 });
    // PawaPay tient la première place depuis le 31 octobre ; en test il n'est
    // pas joignable, donc c'est le repli manuel qu'on déplie et qu'on éprouve.
    await ouvrirVirementManuel(page);
    await page
      .getByLabel("Identifiant de transaction Mobile Money")
      .fill("PP261011.1234.A56789");
    await page.getByRole("button", { name: "J'ai payé" }).click();
    await expect(page.getByText("Paiement déclaré")).toBeVisible({ timeout: 30_000 });

    // Déclarer n'ouvre rien : la modération doit d'abord voir l'argent.
    await page.goto(`/fr/candidats/${profileId}?v=${Date.now()}`);
    await expect(page.getByText(telephone)).toHaveCount(0);

    const { error } = await serviceClient()
      .from("candidate_unlocks")
      .update({ status: "active", payment_confirmed_at: new Date().toISOString() })
      .eq("candidate_id", profileId);
    expect(error).toBeNull();

    await page.goto(`/fr/candidats/${profileId}?v=${Date.now()}`);
    await expect(page.getByRole("link", { name: telephone })).toBeVisible();
    await expect(page.getByText("Numéro débloqué.")).toBeVisible();
  });
});
