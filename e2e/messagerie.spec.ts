import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, signIn, uniqueEmail } from "./helpers";

/**
 * La messagerie, par l'interface.
 *
 * Elle n'était couverte par aucun test : seules les attaques sur la table
 * `messages` l'étaient (securite-moyennes.spec.ts). Or l'envoi passe par une
 * action serveur qui appelle `revalidatePath` depuis la page qui la rend, et ce
 * motif a déjà retenu trois réponses ailleurs dans ce dépôt — réservation,
 * création de candidat, saut de vérification. Il fallait donc le mesurer, pas
 * le supposer.
 */

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

/**
 * Comptes posés par la clé de service plutôt que par le formulaire.
 *
 * Le parcours d'inscription complet prend une vingtaine de secondes par compte
 * et impose la vérification du numéro ; ce qu'on teste ici est la messagerie,
 * et deux comptes prêts valent mieux qu'un test qui échoue pour une case de
 * profil. La candidate est publiée, sans quoi la politique de lecture de
 * `profiles` l'empêcherait d'être trouvée.
 */
async function compte(role: "candidate" | "employer", nom: string, publie = false) {
  const admin = service();
  const email = uniqueEmail(`msg-${role}`);
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

test.describe("messagerie", () => {
  test("un message envoyé s'affiche, et arrive chez l'autre sans rechargement", async ({
    browser,
  }) => {
    const candidate = await compte("candidate", "Awa Massamba", true);
    const employer = await compte("employer", "Famille Loemba");

    const contexteEmployeur = await browser.newContext();
    const pageEmployeur = await contexteEmployeur.newPage();
    const contexteCandidate = await browser.newContext();
    const pageCandidate = await contexteCandidate.newPage();

    await signIn(pageEmployeur, employer.email);
    await signIn(pageCandidate, candidate.email);

    // Le texte d'un message apparaît deux fois : dans la bulle du fil et dans
    // l'aperçu de la conversation, à gauche. Toutes les assertions visent donc
    // le fil, qui est la colonne <section>.
    const filEmployeur = pageEmployeur.locator("section");
    const filCandidate = pageCandidate.locator("section");

    // --- l'employeur écrit ----------------------------------------------------
    await pageEmployeur.goto(`/fr/messages?avec=${candidate.profileId}`);
    await expect(pageEmployeur.getByText("Écrivez votre premier message à Awa Massamba")).toBeVisible();

    const premier = `Bonjour, êtes-vous disponible en novembre ? ${Date.now().toString(36)}`;
    await pageEmployeur.getByPlaceholder("Écrivez votre message...").fill(premier);
    await pageEmployeur.getByRole("button", { name: "Envoyer" }).click();

    // C'est ici que se joue le piège du `revalidatePath` : si la réponse de
    // l'action est retenue, le message n'apparaît jamais et le champ reste
    // rempli.
    await expect(filEmployeur.getByText(premier)).toBeVisible({ timeout: 15_000 });
    await expect(pageEmployeur.getByPlaceholder("Écrivez votre message...")).toHaveValue("");

    // --- la candidate ouvre le fil --------------------------------------------
    // Ce premier message-ci arrive par le chargement de la page : il était déjà
    // écrit. Ce n'est pas encore une preuve du rafraîchissement.
    await pageCandidate.goto(`/fr/messages?avec=${employer.profileId}`);
    await expect(filCandidate.getByText(premier)).toBeVisible({ timeout: 15_000 });

    // --- et la suite, sans qu'elle touche à rien ? ----------------------------
    // Le fil est maintenant chargé et ne le sera plus : à partir d'ici, tout ce
    // qui y apparaît a été amené par le rafraîchissement automatique.
    const reponse = `Oui, à partir du 5. ${Date.now().toString(36)}`;
    await pageEmployeur.getByPlaceholder("Écrivez votre message...").fill(reponse);
    await pageEmployeur.getByRole("button", { name: "Envoyer" }).click();
    await expect(filEmployeur.getByText(reponse)).toBeVisible({ timeout: 15_000 });

    // L'intervalle est de 8 s ; 20 s laissent la marge d'un tour manqué sans
    // rendre le test complaisant — sans rafraîchissement, il n'arriverait
    // jamais.
    await expect(filCandidate.getByText(reponse)).toBeVisible({ timeout: 20_000 });

    await contexteEmployeur.close();
    await contexteCandidate.close();
  });

  test("un numéro de téléphone est refusé dans un message", async ({ page }) => {
    const candidate = await compte("candidate", "Bernice Okemba", true);
    const employer = await compte("employer", "Famille Bakala");

    await signIn(page, employer.email);
    await page.goto(`/fr/messages?avec=${candidate.profileId}`);

    await page
      .getByPlaceholder("Écrivez votre message...")
      .fill("Appelez-moi directement au 06 717 30 30");
    await page.getByRole("button", { name: "Envoyer" }).click();

    // Le refus vient du serveur et doit se lire ; le message ne doit pas partir.
    await expect(
      page.getByText("Les numéros de téléphone ne peuvent pas être partagés")
    ).toBeVisible({ timeout: 15_000 });
    // Le fil est resté vide : son état initial est toujours là.
    await expect(
      page.locator("section").getByText("Écrivez votre premier message à Bernice Okemba")
    ).toBeVisible();

    void employer;
  });
});
