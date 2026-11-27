import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, PNG_1x1, signIn, uniqueEmail } from "./helpers";

/**
 * Le dossier complet d'un candidat pour l'employeur qui a payé
 * (20261127100000_dossier_candidat_employeur.sql).
 *
 * Signalé le 26 novembre 2026 : un employeur qui paie ne voyait du candidat que
 * son nom et son numéro — ni ses pièces d'identité, ni son CV, et pas même un
 * lien vers sa fiche depuis ses candidatures reçues.
 */

const REDIRECTIONS = [302, 303, 307, 308];

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** Sans chiffres : 9 à la suite passent pour un numéro de téléphone. */
function uniqueName(prefix: string) {
  const letters = String(Date.now()).replace(/\d/g, (digit) => "abcdefghij"[Number(digit)]);
  return `${prefix} ${letters}`;
}

async function createAccount(role: "candidate" | "employer", fullName: string) {
  const service = serviceClient();
  const email = uniqueEmail(`dossier-${role}`);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: fullName },
  });
  expect(error).toBeNull();
  const { data: profil } = await service
    .from("profiles")
    .select("id")
    .eq("user_id", data.user!.id)
    .single();
  return { email, userId: data.user!.id, profileId: profil!.id as string };
}

test("l'employeur qui a payé voit le dossier complet du candidat, les autres non", async ({
  browser,
}) => {
  const service = serviceClient();

  // --- une candidate publiée, avec ses pièces et son CV -----------------------
  const nom = uniqueName("Odile Dossier");
  const candidate = await createAccount("candidate", nom);
  await service.from("profiles").update({ is_validated: true }).eq("id", candidate.profileId);
  for (const [bucket, path] of [
    ["pieces", `${candidate.userId}/identite_recto.png`],
    ["pieces", `${candidate.userId}/identite_verso.png`],
    ["cvs", `${candidate.userId}/cv.png`],
  ]) {
    const depot = await service.storage
      .from(bucket)
      .upload(path, PNG_1x1, { contentType: "image/png", upsert: true });
    expect(depot.error).toBeNull();
  }
  expect(
    (
      await service.from("candidate_documents").upsert({
        profile_id: candidate.profileId,
        identity_type: "cni",
        identity_front: `${candidate.userId}/identite_recto.png`,
        identity_back: `${candidate.userId}/identite_verso.png`,
      })
    ).error
  ).toBeNull();
  expect(
    (
      await service
        .from("candidate_details")
        .update({ cv_url: `${candidate.userId}/cv.png`, gender: "F" })
        .eq("profile_id", candidate.profileId)
    ).error
  ).toBeNull();

  // --- un employeur qui n'a rien payé ----------------------------------------
  const curieux = await createAccount("employer", uniqueName("Famille Curieuse"));
  const ctxCurieux = await browser.newContext();
  const pageCurieux = await ctxCurieux.newPage();
  await signIn(pageCurieux, curieux.email);
  await pageCurieux.goto(`/fr/candidats/${candidate.profileId}`);
  await expect(pageCurieux.getByRole("heading", { name: "Pièces d'identité et CV" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(pageCurieux.getByRole("link", { name: "Voir le recto" })).toHaveCount(0);
  const refus = await pageCurieux.request.get(
    `/api/pieces/${candidate.profileId}/identity_front`,
    { maxRedirects: 0 }
  );
  expect(refus.status()).toBe(404);
  expect(
    (await pageCurieux.request.get(`/api/cv/${candidate.profileId}`, { maxRedirects: 0 })).status()
  ).toBe(404);

  // --- un employeur qui a débloqué son numéro, et dont l'offre payante a reçu
  //     sa candidature ---------------------------------------------------------
  const nomEmployeur = uniqueName("Famille Payante");
  const payant = await createAccount("employer", nomEmployeur);
  expect(
    (
      await service.from("candidate_unlocks").insert({
        employer_id: payant.profileId,
        candidate_id: candidate.profileId,
        price: 500,
        status: "active",
      })
    ).error
  ).toBeNull();
  const titre = uniqueName("Nounou Dossier");
  const { data: offre } = await service
    .from("jobs")
    .insert({ employer_id: payant.profileId, title: titre, description: "Offre payante de test." })
    .select("id")
    .single();
  await service
    .from("job_payments")
    .insert({ job_id: offre!.id, employer_id: payant.profileId, price: 5000, status: "active" });
  expect(
    (await service.from("applications").insert({ job_id: offre!.id, candidate_id: candidate.profileId }))
      .error
  ).toBeNull();

  const ctxPayant = await browser.newContext();
  const pagePayant = await ctxPayant.newPage();
  await signIn(pagePayant, payant.email);

  // « Mon espace employeur » se lit à côté de son nom.
  await expect(pagePayant.locator("header").getByText("Mon espace employeur")).toBeVisible();

  // Depuis ses candidatures reçues, la fiche complète est à un toucher.
  await pagePayant.goto("/fr/dashboard/employer");
  const voir = pagePayant.getByRole("link", { name: "Voir le profil complet" });
  await expect(voir).toHaveAttribute("href", `/fr/candidats/${candidate.profileId}`, {
    timeout: 30_000,
  });
  await voir.click();
  await pagePayant.waitForURL(new RegExp(`/fr/candidats/${candidate.profileId}`), { timeout: 30_000 });

  await expect(pagePayant.getByRole("heading", { name: "Dossier du candidat" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(pagePayant.getByText("Femme", { exact: true })).toBeVisible();
  for (const nomLien of ["Voir le recto", "Voir le verso", "Voir le CV"]) {
    const lien = pagePayant.getByRole("link", { name: nomLien });
    await expect(lien).toBeVisible();
    const ouverture = await pagePayant.request.get((await lien.getAttribute("href"))!, {
      maxRedirects: 0,
    });
    expect(REDIRECTIONS).toContain(ouverture.status());
  }

  await ctxCurieux.close();
  await ctxPayant.close();
});
