import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, register, uniqueEmail } from "./helpers";

/**
 * Le chemin qui porte le chiffre d'affaires, de bout en bout.
 *
 * Il ne tenait à rien : les deux boutons de la fiche candidat étaient des
 * `<Button>` nus, sans gestionnaire ni lien, et `/candidats/[id]/reserver`
 * n'était référencé nulle part. Tout l'encaissement était inatteignable depuis
 * l'interface. Ce parcours échouerait à la première étape si cela revenait.
 */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** Un candidat publié, sans quoi il n'apparaît ni en recherche ni en fiche. */
async function candidatPublie(nom: string) {
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

  await admin.from("profiles").update({ is_validated: true }).eq("id", profile!.id);
  await admin
    .from("candidate_details")
    .update({ job_title: "Nounou", availability: "full_time" })
    .eq("profile_id", profile!.id);

  return { profileId: profile!.id as string, email };
}

test.describe("réservation d'un candidat", () => {
  test("réserver, déclarer le paiement, le voir validé des deux côtés", async ({ browser }) => {
    const nomCandidat = `Candidate Résa ${Date.now()}`;
    const { profileId, email: emailCandidat } = await candidatPublie(nomCandidat);

    // --- L'employeur réserve ------------------------------------------------
    const ctxEmployeur = await browser.newContext();
    const employeur = await ctxEmployeur.newPage();
    const emailEmployeur = uniqueEmail("emp");
    await register(employeur, "employer", "Famille Résa", emailEmployeur);

    await employeur.goto(`/fr/candidats/${profileId}`);

    // Le lien manquant : sans lui, aucun chemin vers le paiement.
    await employeur.getByRole("link", { name: "Réserver ce candidat" }).click();
    await employeur.waitForURL(/\/reserver/, { timeout: 30_000 });

    await employeur.getByLabel("Lieu de la mission").fill("Bacongo, Brazzaville");
    await employeur.getByRole("button", { name: /Continuer/ }).click();
    await employeur.getByRole("button", { name: /Confirmer|Valider|Enregistrer/ }).click();

    await expect(employeur.getByText(/Demande enregistrée/)).toBeVisible({ timeout: 30_000 });

    // --- La réservation est visible, et reprenable ---------------------------
    await employeur.goto("/fr/dashboard/employer");
    await expect(employeur.getByRole("heading", { name: "Mes réservations" })).toBeVisible();
    await expect(employeur.getByText("À régler")).toBeVisible();

    // Quitter le tunnel ne doit plus condamner la réservation.
    await employeur.getByText("Régler cette réservation").click();
    await employeur.getByLabel("Identifiant de la transaction").fill("MP-TEST-RESA-001");
    await employeur.getByRole("button", { name: /déclarer la transaction/ }).click();

    // L'action revalide la mise en page : le formulaire disparaît avec l'étape
    // qu'il servait, remplacé par l'état suivant. C'est celui-ci qu'on observe,
    // pas l'écran de succès local qui n'a pas le temps d'exister.
    // L'écran rendu par le composant lui-même, qui reste monté d'une étape à
    // l'autre. Le badge de la ligne suit au rendu serveur suivant.
    await expect(employeur.getByText(/Paiement déclaré/).first()).toBeVisible({
      timeout: 30_000,
    });

    await employeur.goto("/fr/dashboard/employer");
    await expect(employeur.getByText("Paiement en vérification")).toBeVisible();

    // --- La modération valide ------------------------------------------------
    const admin = serviceClient();
    const { data: reservation } = await admin
      .from("bookings")
      .select("id")
      .eq("candidate_id", profileId)
      .single();
    await admin
      .from("bookings")
      .update({ status: "paid", payment_confirmed_at: new Date().toISOString() })
      .eq("id", reservation!.id);

    // Paramètre jetable : deux `goto` vers la même adresse peuvent être servis
    // par le cache du navigateur, et le test lirait l'état d'avant.
    await employeur.goto(`/fr/dashboard/employer?v=${Date.now()}`);
    await expect(employeur.getByText("Réglée", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    // --- Le candidat la voit aussi -------------------------------------------
    const ctxCandidat = await browser.newContext();
    const candidat = await ctxCandidat.newPage();
    await candidat.goto("/fr/login");
    await candidat.getByPlaceholder("email@exemple.com").fill(emailCandidat);
    await candidat.getByPlaceholder("••••••••").fill(PASSWORD);
    await candidat.getByRole("button", { name: "Se connecter" }).click();
    await candidat.waitForURL(/\/fr\/dashboard\/candidate/, { timeout: 30_000 });
    await expect(
      candidat.getByRole("heading", { name: "Familles qui vous ont réservé" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(candidat.getByText("Réglée", { exact: true }).first()).toBeVisible();

    await ctxEmployeur.close();
    await ctxCandidat.close();
  });

  test("un candidat ne se voit pas proposer de réserver un autre candidat", async ({ page }) => {
    const { profileId } = await candidatPublie(`Autre ${Date.now()}`);
    await register(page, "candidate", "Candidate Curieuse");

    await page.goto(`/fr/candidats/${profileId}`);
    // Le tunnel exige le rôle employeur : afficher le bouton le renverrait vers
    // son propre tableau de bord, ce qui se lit comme une panne.
    await expect(page.getByRole("link", { name: "Réserver ce candidat" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Contacter" })).toBeVisible();
  });
});
