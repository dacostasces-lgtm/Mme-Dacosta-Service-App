import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { PASSWORD, completeEmployerAccount, signIn, uniqueEmail } from "./helpers";

/**
 * Seul un candidat publié se présente aux employeurs ; un refusé se supprime ;
 * les paiements PawaPay se lisent dans l'administration
 * (20261122100000_candidats_valides_et_refus.sql).
 *
 * Demandé le 22 novembre 2026 : des candidats pas encore vérifiés postulaient,
 * les candidatures d'un refusé restaient chez les employeurs, et aucun
 * paiement reçu n'apparaissait dans la modération.
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

type Compte = { email: string; profileId: string };

/** Un compte créé par la clé de service ; l'administration se pose après coup. */
async function createAccount(
  role: "admin" | "employer" | "candidate",
  fullName: string,
  profil: Record<string, unknown> = {}
): Promise<Compte> {
  const service = serviceClient();
  const email = uniqueEmail(`valides-${role}`);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: role === "admin" ? "candidate" : role, full_name: fullName },
  });
  expect(error).toBeNull();
  const changes = role === "admin" ? { role: "admin", is_validated: true, ...profil } : profil;
  const query = service.from("profiles");
  const { data: row, error: updateError } = await (Object.keys(changes).length > 0
    ? query.update(changes).eq("user_id", data.user!.id).select("id").single()
    : query.select("id").eq("user_id", data.user!.id).single());
  expect(updateError).toBeNull();
  return { email, profileId: row!.id as string };
}

/** Connecté par l'API, comme le ferait quelqu'un qui contourne l'interface. */
async function apiClient(email: string) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error).toBeNull();
  return client;
}

function rowIn(page: Page, section: string, name: string) {
  return page.locator(`${section} > div > div`).filter({ hasText: name });
}

test("seuls les candidats publiés se présentent ; un refusé se supprime ; les paiements se lisent", async ({
  browser,
}) => {
  const service = serviceClient();

  // --- les comptes -----------------------------------------------------------
  const nomEmployeur = uniqueName("Famille Valides");
  const employeur = await createAccount("employer", nomEmployeur);
  // Numéro confirmé et quartier : ni la vérification ni « Complétez votre
  // compte » ne doivent détourner le tableau de bord.
  await completeEmployerAccount(employeur.profileId);
  const publiee = await createAccount("candidate", uniqueName("Prisca Publiee"), { is_validated: true });
  const attente = await createAccount("candidate", uniqueName("Ines Attente"));
  const refusee = await createAccount("candidate", uniqueName("Rose Refusee"));
  const admin = await createAccount("admin", "Modération Valides");

  const { data: noms } = await service
    .from("profiles")
    .select("id, full_name")
    .in("id", [publiee.profileId, attente.profileId, refusee.profileId]);
  const nom = (id: string) => noms!.find((row) => row.id === id)!.full_name as string;

  // Refusée par la modération : le refus retire la publication.
  expect(
    (await service.from("profile_rejections").insert({ profile_id: refusee.profileId, reason: "Pièce illisible" }))
      .error
  ).toBeNull();

  const titre = uniqueName("Nounou Valides");
  const { data: offre } = await service
    .from("jobs")
    .insert({ employer_id: employeur.profileId, title: titre, description: "Garde de deux enfants." })
    .select("id")
    .single();

  // Trois candidatures déjà là : la publiée, et deux d'avant la règle.
  for (const candidate of [publiee, attente, refusee]) {
    expect(
      (await service.from("applications").insert({ job_id: offre!.id, candidate_id: candidate.profileId }))
        .error
    ).toBeNull();
  }

  // --- la base refuse ce que l'interface ne propose plus ---------------------
  const enAttente = await apiClient(attente.email);
  expect((await enAttente.rpc("request_contact_unlock", { p_job_id: offre!.id })).error).not.toBeNull();
  await service.from("applications").delete().eq("candidate_id", attente.profileId);
  expect(
    (await enAttente.from("applications").insert({ job_id: offre!.id, candidate_id: attente.profileId }))
      .error
  ).not.toBeNull();
  await service.from("applications").insert({ job_id: offre!.id, candidate_id: attente.profileId });

  // --- l'employeur ne voit que la candidature publiée ------------------------
  const ctxEmployeur = await browser.newContext();
  const pageEmployeur = await ctxEmployeur.newPage();
  await signIn(pageEmployeur, employeur.email);
  await pageEmployeur.goto("/fr/dashboard/employer");
  await expect(
    pageEmployeur.getByRole("heading", { name: /Candidatures reçues \(1\)/ })
  ).toBeVisible({ timeout: 30_000 });
  await expect(pageEmployeur.getByText(`${nom(publiee.profileId)} · ${titre}`)).toBeVisible();
  await expect(pageEmployeur.getByText(nom(attente.profileId))).toHaveCount(0);
  await expect(pageEmployeur.getByText(nom(refusee.profileId))).toHaveCount(0);

  // --- l'administration voit tout, avec l'état de chacun ---------------------
  const ctxAdmin = await browser.newContext();
  const pageAdmin = await ctxAdmin.newPage();
  await signIn(pageAdmin, admin.email);
  await pageAdmin.goto("/fr/admin/candidatures");
  const ligne = (id: string) => pageAdmin.locator("tr").filter({ hasText: nom(id) });
  await expect(ligne(publiee.profileId).getByText("Profil publié")).toBeVisible({ timeout: 30_000 });
  await expect(
    ligne(attente.profileId).getByText("Pas encore validé · invisible pour l'employeur")
  ).toBeVisible();
  await expect(ligne(refusee.profileId).getByText("Refusé · invisible pour l'employeur")).toBeVisible();

  // --- les paiements PawaPay se lisent ---------------------------------------
  const { data: deblocage } = await service
    .from("contact_unlocks")
    .insert({ candidate_id: publiee.profileId, job_id: offre!.id, price: 500, status: "active" })
    .select("id")
    .single();
  const recu = randomUUID();
  const enCours = randomUUID();
  expect(
    (
      await service.from("pawapay_deposits").insert([
        {
          deposit_id: recu,
          purpose: "contact_unlock",
          target_id: deblocage!.id,
          profile_id: publiee.profileId,
          amount: 500,
          provider: "MTN_MOMO_COG",
          status: "COMPLETED",
          provider_transaction_id: "8546014469",
        },
        {
          deposit_id: enCours,
          purpose: "contact_unlock",
          target_id: deblocage!.id,
          profile_id: publiee.profileId,
          amount: 500,
          provider: "AIRTEL_COG",
          status: "PROCESSING",
        },
      ])
    ).error
  ).toBeNull();

  await pageAdmin.goto("/fr/admin");
  await pageAdmin.getByRole("link", { name: "Paiements reçus" }).click();
  await pageAdmin.waitForURL(/\/fr\/admin\/paiements/, { timeout: 30_000 });
  const carteRecue = pageAdmin.locator("li").filter({ hasText: recu });
  await expect(carteRecue.getByText("Reçu", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(carteRecue.getByText(`offre « ${titre} » de ${nomEmployeur}`)).toBeVisible();
  await expect(carteRecue.getByText(`Payé par ${nom(publiee.profileId)}`)).toBeVisible();
  await expect(carteRecue.getByText(/MTN · .*réf\. opérateur 8546014469/)).toBeVisible();
  const carteEnCours = pageAdmin.locator("li").filter({ hasText: enCours });
  await expect(carteEnCours.getByText("En cours", { exact: true })).toBeVisible();
  await expect(carteEnCours.getByRole("button", { name: "Vérifier auprès de PawaPay" })).toBeVisible();

  // --- un refusé se supprime définitivement ----------------------------------
  await pageAdmin.goto("/fr/admin");
  const refuses = pageAdmin.locator("#refuses");
  await expect(async () => {
    if (!(await refuses.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await refuses.locator("summary").click();
    }
    await expect(rowIn(pageAdmin, "#refuses", nom(refusee.profileId))).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const carteRefusee = rowIn(pageAdmin, "#refuses", nom(refusee.profileId));
  const supprimer = carteRefusee.getByRole("button", { name: "Supprimer définitivement" });
  const confirmer = carteRefusee.getByRole("button", { name: "Confirmer la suppression" });
  await expect(async () => {
    if (await supprimer.isVisible()) await supprimer.click();
    await expect(confirmer).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await confirmer.click();
  await expect(rowIn(pageAdmin, "#refuses", nom(refusee.profileId))).toHaveCount(0, { timeout: 30_000 });

  const { data: apres } = await service
    .from("profiles")
    .select("full_name, deleted_at, is_validated")
    .eq("id", refusee.profileId)
    .single();
  expect(apres).toMatchObject({ full_name: "Compte supprimé", is_validated: false });
  expect(apres!.deleted_at).not.toBeNull();
  const { count: restantes } = await service
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", refusee.profileId);
  expect(restantes).toBe(0);
  expect(
    (await anonClient().auth.signInWithPassword({ email: refusee.email, password: PASSWORD })).error
  ).not.toBeNull();

  await ctxEmployeur.close();
  await ctxAdmin.close();
});
