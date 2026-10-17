import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, signIn, uniqueEmail } from "./helpers";

/**
 * Laisser un avis, par l'interface.
 *
 * La base était prête depuis 20261015130000_avis_merites.sql — un avis par
 * couple, après une mission réglée — mais rien dans l'application ne permettait
 * d'en écrire un : la fiche candidat affichait « Pas encore d'avis » sans aucun
 * chemin pour en laisser.
 */

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

async function compte(role: "candidate" | "employer", nom: string, publie = false) {
  const admin = service();
  const email = uniqueEmail(`avis-${role}`);
  const { data: cree, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: nom },
  });
  expect(error).toBeNull();

  const { data: profil } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", cree.user!.id)
    .single();

  if (publie) {
    await admin.from("profiles").update({ is_validated: true }).eq("id", profil!.id);
  }

  return { email, profileId: profil!.id as string };
}

test.describe("avis", () => {
  test("un employeur note la candidate qu'il a réglée, et l'avis paraît sur la fiche", async ({
    page,
  }) => {
    const admin = service();
    const candidate = await compte("candidate", "Chancelle Mabiala", true);
    const employer = await compte("employer", "Famille Samba");

    // La réservation réglée est la condition que la base impose. Posée par la
    // clé de service : le tunnel de paiement Mobile Money est manuel, et le
    // rejouer ici testerait le paiement, pas l'avis.
    await admin.from("bookings").insert({
      employer_id: employer.profileId,
      candidate_id: candidate.profileId,
      amount: 15000,
      status: "paid",
    });

    await signIn(page, employer.email);
    await page.goto("/fr/dashboard/employer");

    // L'avis s'ouvre depuis la réservation : c'est là qu'on sait de qui on parle.
    await page
      .getByText(`Laisser un avis sur Chancelle Mabiala`)
      .click();
    await page.getByRole("button", { name: "4 étoiles sur 5" }).click();
    await page
      .getByLabel(/Votre commentaire/)
      .fill("Ponctuelle, douce avec les enfants, et la maison est impeccable.");
    await page.getByRole("button", { name: "Publier mon avis" }).click();

    await expect(page.getByText("Merci, votre avis est enregistré.")).toBeVisible({
      timeout: 15_000,
    });

    // Sur la fiche publique, sans être connecté : c'est là que l'avis sert.
    await page.context().clearCookies();
    await page.goto(`/fr/candidats/${candidate.profileId}`);

    await expect(page.getByRole("heading", { name: "Avis des familles" })).toBeVisible();
    await expect(page.getByText("Ponctuelle, douce avec les enfants")).toBeVisible();
    // Et la moyenne a suivi.
    await expect(page.getByText("(1 avis)")).toBeVisible();
  });

  test("un avis se corrige, et ne s'empile pas", async ({ page }) => {
    const admin = service();
    const candidate = await compte("candidate", "Prudence Ngoma", true);
    const employer = await compte("employer", "Famille Itoua");

    await admin.from("bookings").insert({
      employer_id: employer.profileId,
      candidate_id: candidate.profileId,
      amount: 15000,
      status: "paid",
    });

    await signIn(page, employer.email);
    await page.goto("/fr/dashboard/employer");
    await page.getByText("Laisser un avis sur Prudence Ngoma").click();
    await page.getByRole("button", { name: "2 étoiles sur 5" }).click();
    await page.getByLabel(/Votre commentaire/).fill("Des retards au début.");
    await page.getByRole("button", { name: "Publier mon avis" }).click();
    await expect(page.getByText("Merci, votre avis est enregistré.")).toBeVisible({
      timeout: 15_000,
    });

    // Rechargé : le résumé doit maintenant porter la note déjà donnée, et le
    // formulaire se rouvrir sur ce qui a été écrit.
    await page.goto("/fr/dashboard/employer");
    await page.getByText("Votre avis : 2/5 — le modifier").click();
    await expect(page.getByLabel(/Votre commentaire/)).toHaveValue("Des retards au début.");

    await page.getByRole("button", { name: "5 étoiles sur 5" }).click();
    await page.getByLabel(/Votre commentaire/).fill("Les retards ont cessé, rien à redire.");
    await page.getByRole("button", { name: "Corriger mon avis" }).click();
    await expect(page.getByText("Merci, votre avis est enregistré.")).toBeVisible({
      timeout: 15_000,
    });

    // Un seul avis en base, pas deux : la contrainte d'unicité a joué, et
    // l'interface l'a traitée comme une correction plutôt que comme une erreur.
    const { data: tous } = await admin
      .from("reviews")
      .select("rating, comment")
      .eq("reviewee_id", candidate.profileId);
    expect(tous).toHaveLength(1);
    expect(tous![0]).toMatchObject({ rating: 5, comment: "Les retards ont cessé, rien à redire." });
  });

  test("sans mission réglée, l'avis est refusé", async () => {
    const admin = service();
    const candidate = await compte("candidate", "Sans mission", true);
    const employer = await compte("employer", "Famille sans réservation");

    // Pas d'interface à solliciter ici : le bouton n'existe pas sans
    // réservation. C'est donc l'API qu'on attaque directement, avec la clé
    // publique et une session ordinaire — par où l'on tricherait.
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { error: erreurConnexion } = await client.auth.signInWithPassword({
      email: employer.email,
      password: PASSWORD,
    });
    expect(erreurConnexion).toBeNull();

    const forge = await client.from("reviews").insert({
      reviewer_id: employer.profileId,
      reviewee_id: candidate.profileId,
      rating: 5,
      comment: "Avis forgé",
    });
    expect(forge.error).not.toBeNull();

    const { data: tous } = await admin
      .from("reviews")
      .select("id")
      .eq("reviewee_id", candidate.profileId);
    expect(tous).toHaveLength(0);
  });
});
