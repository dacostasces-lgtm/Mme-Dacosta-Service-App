import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, completeCandidateProfile, register, signIn, uniqueEmail } from "./helpers";

/**
 * La file de modération ne reçoit que des inscriptions terminées, et la fiche
 * d'une candidate montre son âge et sa situation familiale aux familles qui
 * recrutent — pas au premier venu.
 *
 * Signalé le 22 octobre 2026 : un candidat qui n'avait ni rempli son profil ni
 * confirmé son numéro arrivait dans « En attente », et rien sur les fiches ne
 * disait l'âge, pourtant décisif pour une nounou ou une ménagère.
 */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** Numéro congolais valide et unique : 9 chiffres, préfixe mobile. */
function uniquePhone() {
  const suffix = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  return `06${suffix}`;
}

/**
 * Un nom unique, sans chiffres : les 13 de `Date.now()` passent pour un numéro
 * de téléphone (9 chiffres ou plus), et reject_phone_numbers refuse alors
 * d'enregistrer le profil que la candidate soumet sous ce nom.
 */
function uniqueName(prefix: string) {
  const letters = String(Date.now()).replace(/\d/g, (digit) => "abcdefghij"[Number(digit)]);
  return `${prefix} ${letters}`;
}

/**
 * Un compte prêt à se connecter. Le rôle admin se pose après coup, par la clé
 * de service : `handle_new_user` ne connaît que candidat et employeur.
 */
async function createAccount(role: "admin" | "employer") {
  const admin = serviceClient();
  const email = uniqueEmail(`file-${role}`);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: role === "admin" ? "candidate" : role,
      full_name: role === "admin" ? "Modération File" : "Famille Test",
    },
  });
  expect(error).toBeNull();

  if (role === "admin") {
    const { error: roleError } = await admin
      .from("profiles")
      .update({ role: "admin", is_validated: true })
      .eq("user_id", data.user!.id);
    expect(roleError).toBeNull();
  }
  return email;
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

test.describe("file de modération et situation familiale", () => {
  test("seule une inscription terminée attend une décision, et la fiche montre la situation aux familles", async ({
    browser,
  }) => {
    const nom = uniqueName("Clarisse File");

    // --- l'inscription seule ne suffit pas -------------------------------------
    const ctxCandidate = await browser.newContext();
    const candidate = await ctxCandidate.newPage();
    await register(candidate, "candidate", nom);

    const ctxAdmin = await browser.newContext();
    const admin = await ctxAdmin.newPage();
    await signIn(admin, await createAccount("admin"));
    await admin.goto("/fr/admin");

    await expect(rowIn(admin, "#profils", nom)).toHaveCount(0);
    await openUnfinished(admin);
    const incomplete = rowIn(admin, "#inscriptions-non-terminees", nom);
    await expect(incomplete.getByText(/Profil incomplet — manque/)).toBeVisible();
    // Ni « Publier », ni la confirmation par appel : il reste des cases vides.
    await expect(incomplete.getByRole("button", { name: "Publier", exact: true })).toHaveCount(0);
    await expect(incomplete.getByRole("button", { name: "Numéro confirmé par appel" }))
      .toHaveCount(0);

    // --- profil complet, numéro pas confirmé ------------------------------------
    // La porte de secours du SMS (l'envoi pointe vers le vide en test) laisse
    // entrer sans confirmer le numéro.
    await completeCandidateProfile(candidate, uniquePhone());
    await expect(candidate.getByText("Votre profil n'est pas encore envoyé à notre équipe"))
      .toBeVisible();
    await expect(candidate.getByRole("link", { name: "Confirmer mon numéro par SMS" }))
      .toBeVisible();

    await admin.reload();
    await expect(rowIn(admin, "#profils", nom)).toHaveCount(0);
    await openUnfinished(admin);
    const unconfirmed = rowIn(admin, "#inscriptions-non-terminees", nom);
    await expect(unconfirmed.getByText("Profil complet", { exact: true })).toBeVisible();
    await expect(unconfirmed.getByRole("button", { name: "Publier", exact: true })).toHaveCount(0);
    await expect(unconfirmed.getByText("Numéro pas encore confirmé par SMS")).toBeVisible();
    // L'âge et la situation, pour juger le dossier.
    await expect(unconfirmed.getByText(/32 ans · Marié\(e\) · 2 enfants, le plus jeune a 4 ans/))
      .toBeVisible();

    // --- l'équipe appelle et confirme : le dossier passe en attente -------------
    await unconfirmed.getByRole("button", { name: "Numéro confirmé par appel" }).click();
    const ready = rowIn(admin, "#profils", nom);
    await expect(ready).toHaveCount(1, { timeout: 30_000 });
    await ready.getByRole("button", { name: "Publier", exact: true }).click();
    await expect(rowIn(admin, "#profils", nom)).toHaveCount(0, { timeout: 30_000 });

    const { data: profil } = await serviceClient()
      .from("profiles")
      .select("id, is_validated")
      .eq("full_name", nom)
      .single();
    expect(profil?.is_validated).toBe(true);

    // --- une famille connectée voit l'âge et la situation -----------------------
    const ctxEmployer = await browser.newContext();
    const employer = await ctxEmployer.newPage();
    await signIn(employer, await createAccount("employer"));
    await employer.goto(`/fr/candidats/${profil!.id}`);
    await expect(employer.getByRole("heading", { name: "Situation familiale" })).toBeVisible();
    await expect(employer.getByText("32 ans").first()).toBeVisible();
    await expect(employer.getByText("Marié(e)")).toBeVisible();
    await expect(employer.getByText("2 enfants, le plus jeune a 4 ans")).toBeVisible();

    // --- un visiteur sans compte, non ------------------------------------------
    const ctxVisitor = await browser.newContext();
    const visitor = await ctxVisitor.newPage();
    await visitor.goto(`/fr/candidats/${profil!.id}`);
    await expect(visitor.getByRole("heading", { level: 1, name: nom })).toBeVisible();
    await expect(visitor.getByText("Visibles par les employeurs inscrits.")).toBeVisible();
    await expect(visitor.getByText("32 ans")).toHaveCount(0);
    await expect(visitor.getByText("Marié(e)")).toHaveCount(0);

    for (const ctx of [ctxCandidate, ctxAdmin, ctxEmployer, ctxVisitor]) await ctx.close();
  });

  test("la situation familiale ne se lit ni en direct ni par une autre candidate", async () => {
    const service = serviceClient();
    const anon = () =>
      createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
      });

    async function connecte(role: "candidate" | "employer", publie: boolean) {
      const email = uniqueEmail(`situation-${role}`);
      const { data, error } = await service.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { role, full_name: `Situation ${role}` },
      });
      expect(error).toBeNull();
      const { data: profil } = await service
        .from("profiles")
        .update({ is_validated: publie })
        .eq("user_id", data.user!.id)
        .select("id")
        .single();
      const client = anon();
      expect((await client.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
      return { client, profileId: profil!.id as string };
    }

    const candidate = await connecte("candidate", true);
    const autre = await connecte("candidate", true);
    const employeur = await connecte("employer", false);

    // Elle l'écrit par sa fonction ; l'âge du dernier enfant sans enfant est ignoré.
    const sansEnfant = await candidate.client.rpc("save_my_family_situation", {
      p_marital_status: "celibataire",
      p_children_count: 0,
      p_youngest_child_age: 5,
    });
    expect(sansEnfant.error).toBeNull();
    const relu = await candidate.client.rpc("my_candidate_details");
    expect(relu.data?.[0]).toMatchObject({
      marital_status: "celibataire",
      children_count: 0,
      youngest_child_age: null,
    });

    // Une valeur hors liste est refusée par la base, pas seulement par le formulaire.
    const inventee = await candidate.client.rpc("save_my_family_situation", {
      p_marital_status: "inconnue",
      p_children_count: 1,
      p_youngest_child_age: 2,
    });
    expect(inventee.error).not.toBeNull();

    // Pas de lecture directe des colonnes, pour personne.
    for (const client of [anon(), employeur.client, candidate.client]) {
      for (const colonne of ["marital_status", "children_count", "youngest_child_age"]) {
        const lecture = await client.from("candidate_details").select(colonne);
        expect(lecture.error, `${colonne} lisible en direct`).not.toBeNull();
      }
    }

    // La fonction de la fiche : rien pour un visiteur ni pour une autre
    // candidate, la situation pour un employeur connecté.
    const parVisiteur = await anon().rpc("candidate_situation", {
      p_candidate_id: candidate.profileId,
    });
    expect(parVisiteur.data ?? []).toHaveLength(0);

    const parAutre = await autre.client.rpc("candidate_situation", {
      p_candidate_id: candidate.profileId,
    });
    expect(parAutre.error).toBeNull();
    expect(parAutre.data).toHaveLength(0);

    const parEmployeur = await employeur.client.rpc("candidate_situation", {
      p_candidate_id: candidate.profileId,
    });
    expect(parEmployeur.error).toBeNull();
    expect(parEmployeur.data?.[0]).toMatchObject({ marital_status: "celibataire", children_count: 0 });
  });
});
