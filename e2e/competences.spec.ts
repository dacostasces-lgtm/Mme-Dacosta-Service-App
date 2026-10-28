import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { chooseSkill, fillCandidateProfile, register, saveProfile } from "./helpers";

/**
 * Les compétences se touchent dans une liste ; ce qui manque s'écrit en
 * quelques mots dans « Autre compétence ».
 *
 * Signalé le 28 octobre 2026 : une candidate avait écrit ses compétences en
 * phrases, et la fiche les montrait découpées à chaque virgule, les plus
 * longues sortant de la carte.
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

/** Sans chiffres : 9 à la suite passent pour un numéro de téléphone. */
function uniqueName(prefix: string) {
  const letters = String(Date.now()).replace(/\d/g, (digit) => "abcdefghij"[Number(digit)]);
  return `${prefix} ${letters}`;
}

test("les compétences se touchent, et une phrase est refusée sans rien effacer", async ({
  page,
}) => {
  const nom = uniqueName("Prudence Liste");
  await register(page, "candidate", nom);
  await fillCandidateProfile(page, uniquePhone());

  // Une phrase dans « Autre compétence » : refusée, avec de quoi corriger…
  await chooseSkill(page, "Autre compétence…");
  const autre = page.getByLabel("Autre compétence", { exact: true });
  await autre.fill("Jeux éducatifs et activités adaptées pour les enfants de tout âge");
  await expect(saveProfile(page)).rejects.toThrow(/quelques mots/);

  // … et rien de ce qui était rempli n'a disparu : React vidait le formulaire
  // à chaque envoi, refusé ou non.
  await expect(page.getByLabel("Âge", { exact: true })).toHaveValue("32");
  await expect(page.getByLabel("Situation matrimoniale")).toHaveValue("marie");
  await expect(page.getByLabel("Adresse précise")).toHaveValue("12 rue Mbochi, derrière l'école");

  // Quelques mots : enregistré. Pas saveProfile ici : le refus précédent est
  // encore affiché au moment du clic, et il le prendrait pour la réponse.
  await autre.fill("Couture");
  await page.getByRole("button", { name: "Enregistrer mon profil" }).click();
  await expect(page.getByText("Profil enregistré.")).toBeVisible({ timeout: 20_000 });

  // Relu après rechargement : les mêmes cases cochées, « Couture » à part.
  await page.reload();
  const competences = page.getByRole("group", { name: "Compétences" });
  for (const skill of ["Garde d'enfants", "Cuisine congolaise", "Repassage"]) {
    await expect(competences.getByRole("button", { name: skill, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  }
  await expect(page.getByLabel("Autre compétence", { exact: true })).toHaveValue("Couture");

  // Sur la fiche, une étiquette par compétence.
  const { data: profil } = await serviceClient()
    .from("profiles")
    .select("id")
    .eq("full_name", nom)
    .single();
  await page.goto(`/fr/candidats/${profil!.id}`);
  const carte = page.getByRole("heading", { name: "Compétences", exact: true }).locator("xpath=..");
  for (const skill of ["Garde d'enfants", "Cuisine congolaise", "Repassage", "Couture"]) {
    await expect(carte.getByText(skill, { exact: true })).toBeVisible();
  }
});
