import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PASSWORD, uniqueEmail } from "./helpers";

/**
 * Les failles faibles de l'audit du 12 octobre 2026, rejouées.
 *
 * Même principe que securite.spec.ts et securite-moyennes.spec.ts : l'API
 * appelée directement avec la clé publique et une session ordinaire, puisque
 * c'est par là qu'on triche.
 *
 * Un point de l'audit n'est pas ici : `anon` avait TRUNCATE sur toutes les
 * tables, droit que RLS ne filtre pas. PostgREST n'émet jamais de TRUNCATE,
 * donc aucun appel depuis le navigateur ne peut l'atteindre — et aucun test
 * d'ici ne peut donc le prouver non plus. Le retrait est vérifié en SQL, et la
 * migration 20261017130000 porte la trace de l'essai.
 */

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const anonyme = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

type Compte = { client: SupabaseClient; profileId: string; userId: string; email: string };

async function compte(role: "candidate" | "employer", publie = false): Promise<Compte> {
  const admin = service();
  const email = uniqueEmail(`faible-${role}`);
  const { data: cree, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: `Test faible ${role}` },
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

  const client = anonyme();
  const { error: erreurConnexion } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  expect(erreurConnexion).toBeNull();

  return { client, profileId: profil!.id as string, userId: cree.user!.id, email };
}

test.describe("audit de sécurité : failles faibles", () => {
  test("l'âge, le sexe, le CV et l'identité de la modératrice ne se lisent pas en direct", async () => {
    const admin = service();
    const candidat = await compte("candidate", true);
    const employeur = await compte("employer");

    // Ce qui doit rester caché, même d'un employeur connecté et même du
    // candidat lui-même : l'ouvrir à son propriétaire par un GRANT l'ouvrirait
    // à tout le monde, puisqu'un GRANT ne distingue pas les lignes.
    for (const colonne of [
      "age",
      "gender",
      "cv_url",
      "identity_checked_by",
      "criminal_record_checked_by",
      "interview_passed_by",
    ]) {
      for (const [qui, client] of [
        ["un anonyme", anonyme()],
        ["un employeur", employeur.client],
        ["le candidat lui-même", candidat.client],
      ] as const) {
        const lecture = await client.from("candidate_details").select(colonne);
        expect(lecture.error, `${colonne} lisible par ${qui}`).not.toBeNull();
      }
    }

    // Et ce qui reste public, sans quoi la recherche n'afficherait plus rien.
    const metier = await anonyme().from("candidate_details").select("job_title, experience");
    expect(metier.error).toBeNull();

    // Le propriétaire lit les siennes par la fonction, elle seule.
    const miennes = await candidat.client.rpc("my_candidate_details");
    expect(miennes.error).toBeNull();
    expect(miennes.data).toHaveLength(1);

    // La fonction de modération refuse qui n'est pas de la modération.
    const vole = await employeur.client.rpc("admin_candidate_private", {
      p_ids: [candidat.profileId],
    });
    expect(vole.error).not.toBeNull();

    void admin;
  });

  test("le seau des photos ne se laisse pas énumérer", async () => {
    const admin = service();
    const proprietaire = await compte("candidate", true);
    const curieux = await compte("employer");

    const photo = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea735c9770000000049454e44ae426082",
      "hex"
    );
    const envoi = await proprietaire.client.storage
      .from("avatars")
      .upload(`${proprietaire.userId}/avatar.png`, photo, { contentType: "image/png" });
    expect(envoi.error).toBeNull();

    // Lister rendait tous les chemins `<identifiant>/avatar…`, soit
    // l'identifiant interne de chaque inscrit et leur nombre.
    const parUnAnonyme = await anonyme().storage.from("avatars").list();
    expect(parUnAnonyme.data ?? []).toHaveLength(0);

    const parUnAutre = await curieux.client.storage.from("avatars").list();
    expect(parUnAutre.data ?? []).toHaveLength(0);

    // Son propriétaire, lui, retrouve bien les siennes.
    const lesSiennes = await proprietaire.client.storage
      .from("avatars")
      .list(proprietaire.userId);
    expect(lesSiennes.error).toBeNull();
    expect(lesSiennes.data?.map((f) => f.name)).toContain("avatar.png");

    // Et la photo reste affichable par son adresse : le seau est public, et
    // c'est ce chemin-là que la recherche utilise.
    const { data: publique } = proprietaire.client.storage
      .from("avatars")
      .getPublicUrl(`${proprietaire.userId}/avatar.png`);
    const reponse = await fetch(publique.publicUrl);
    expect(reponse.status).toBe(200);

    void admin;
  });

  test("enregistrer son profil fonctionne toujours, et refuse toujours un numéro", async () => {
    const candidat = await compte("candidate", true);

    const champs = {
      p_job_title: "Gouvernante",
      p_age: 34,
      p_gender: "F",
      p_experience: "Six ans chez des particuliers",
      p_desired_salary: 90000,
      p_availability: "full_time",
      p_languages: ["Français", "Lingala"],
      p_skills: ["Repassage", "Cuisine congolaise"],
      p_work_days: ["mon", "tue"],
      p_start_time: "08:00",
      p_end_time: "17:00",
      p_live_in: false,
    };

    // L'`upsert` d'origine réclamait le SELECT sur toute la table : c'est ce qui
    // avait cassé en fermant la lecture de l'âge.
    const enregistre = await candidat.client.rpc("save_my_candidate_details", champs);
    expect(enregistre.error).toBeNull();

    const relu = await candidat.client.rpc("my_candidate_details");
    expect(relu.error).toBeNull();
    expect(relu.data?.[0]).toMatchObject({ job_title: "Gouvernante", age: 34, gender: "F" });

    // Le CV s'écrit à part et n'efface pas le reste.
    const cv = await candidat.client.rpc("save_my_cv", {
      p_cv_url: `${candidat.userId}/cv.pdf`,
    });
    expect(cv.error).toBeNull();
    const apresCv = await candidat.client.rpc("my_candidate_details");
    expect(apresCv.data?.[0]).toMatchObject({
      job_title: "Gouvernante",
      cv_url: `${candidat.userId}/cv.pdf`,
    });

    // La fonction est en `SECURITY INVOKER` : en `DEFINER` elle tournerait sous
    // son propriétaire, que `reject_phone_numbers` exempte, et le filtre
    // anti-numéros serait contourné par la porte qu'on vient d'ouvrir.
    const avecNumero = await candidat.client.rpc("save_my_candidate_details", {
      ...champs,
      p_experience: "Appelez-moi au 06 717 30 30",
    });
    expect(avecNumero.error).not.toBeNull();
  });

  test("un lien piégé n'affiche pas son propre message sur la page de connexion", async ({
    page,
  }) => {
    const piege = "Compte bloqué : payez 50 000 FCFA au 06 00 00 00 00 pour le rouvrir";
    await page.goto(`/fr/login?error=${encodeURIComponent(piege)}`);

    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await expect(page.getByText("payez 50 000 FCFA")).toHaveCount(0);
    await expect(page.getByText("06 00 00 00 00")).toHaveCount(0);

    // Un code connu, lui, donne bien son message.
    await page.goto("/fr/login?error=lien_expire");
    await expect(page.getByText(/expiré/i)).toBeVisible();
  });

  test("confirmer une adresse ne connecte personne", async ({ request }) => {
    const admin = service();
    const email = uniqueEmail("faible-confirm");
    const { data: cree, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: false,
      user_metadata: { role: "candidate", full_name: "Test confirmation" },
    });
    expect(error).toBeNull();

    const { data: lien, error: erreurLien } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password: PASSWORD,
    });
    expect(erreurLien).toBeNull();

    // Le lien suivi depuis un navigateur qui n'est pas celui de l'inscription :
    // c'est tout le scénario. `verifyOtp` ouvrait une session rattachée à
    // personne, donc envoyer son lien à quelqu'un le connectait à son compte.
    // `maxRedirects: 0` : il faut lire la redirection elle-même, et surtout les
    // cookies qu'elle pose ou ne pose pas.
    const reponse = await request.get(
      `/auth/confirm?token_hash=${lien!.properties!.hashed_token}&type=signup&locale=fr`,
      { maxRedirects: 0 }
    );

    expect(reponse.status()).toBeGreaterThanOrEqual(300);
    expect(reponse.status()).toBeLessThan(400);
    const destination = reponse.headers()["location"] ?? "";
    expect(destination).toContain("/login");
    expect(destination).toContain("confirme=1");

    // Aucun cookie de session n'est posé : la personne doit saisir son mot de
    // passe, et c'est lui qui rattache la session à la bonne personne.
    const cookies = reponse
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    const session = cookies.filter((c) => /sb-.*auth-token=[^;\s]/.test(c));
    expect(session, `cookies posés : ${cookies.join(" | ")}`).toHaveLength(0);

    // L'adresse est bien confirmée, elle : c'était l'objet du lien.
    const { data: apres } = await admin.auth.admin.getUserById(cree.user!.id);
    expect(apres.user?.email_confirmed_at).not.toBeNull();
  });
});
