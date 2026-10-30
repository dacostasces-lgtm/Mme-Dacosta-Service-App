import { deflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";

/** Fresh address per run: the local stack is reset between runs, but a retry
 *  inside one run must not collide with the account the first attempt created. */
export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;
}

export const PASSWORD = "motdepasse2026";

type Role = "candidate" | "employer";

/**
 * Signs a new user up through the real form.
 *
 * The register form's labels are not tied to their inputs (no htmlFor/id), so
 * these go through placeholders rather than getByLabel — worth fixing in the
 * component, but the test should not pretend the markup is something it isn't.
 *
 * Local Supabase has `enable_confirmations = false`, so signup returns a
 * session immediately and the app redirects to the dashboard. With
 * confirmations on — the likely production setting — the form would instead
 * show "Vérifiez votre boîte mail" and this helper would need the mail step.
 */
export async function register(
  page: Page,
  role: Role,
  fullName: string,
  email = uniqueEmail(role)
) {
  await page.goto("/fr/register");

  await page.locator('select[name="role"]').selectOption(role);
  await page.getByPlaceholder("Awa Dacosta").fill(fullName);

  // L'inscription se fait avec un email OU un numéro. Le formulaire propose le
  // numéro par défaut ; ce chemin-ci choisit l'email, l'autre est couvert par
  // `registerByPhone`.
  await page.getByRole("button", { name: "Mon email" }).click();
  await page.getByPlaceholder("email@exemple.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByLabel("Ville").selectOption({ label: "Brazzaville" });
  await page.getByLabel("Quartier").selectOption({ label: "Bacongo" });

  await page.getByRole("button", { name: "Créer mon compte" }).click();

  // Pas de numéro sur ce compte, donc pas d'étape de vérification : la porte
  // posée dans requireUser ne s'applique qu'aux comptes qui en ont un.
  // Un candidat arrive sur son profil, qu'il doit compléter avant de postuler.
  const landing = role === "employer" ? "/dashboard/employer" : "/profil";

  // Un seul nouvel essai, et seulement devant l'envoi d'email : le service de
  // courrier de la pile locale rend parfois un 504, et l'inscription échoue
  // alors sur un incident d'environnement qui ressemble à un défaut du code.
  // Rien d'autre n'est retenté — un vrai refus doit rester un échec.
  const envoiRate = page.getByText(/n'a pas pu envoyer l'email de confirmation/i);
  await Promise.race([
    page.waitForURL(new RegExp(`/fr${landing}`), { timeout: 30_000 }).catch(() => {}),
    envoiRate.waitFor({ timeout: 30_000 }).catch(() => {}),
  ]);
  if (await envoiRate.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Créer mon compte" }).click();
  }

  await page.waitForURL(new RegExp(`/fr${landing}`), { timeout: 30_000 });

  return { email, password: PASSWORD };
}

/**
 * Remplit toutes les cases obligatoires du profil candidat
 * (src/lib/profile/completeness.ts), l'enregistre, envoie la pièce d'identité,
 * puis franchit la vérification du numéro par la porte de secours : en test
 * l'envoi SMS pointe vers le vide. Sans profil complet, un candidat ne peut pas
 * postuler.
 */
export async function completeCandidateProfile(page: Page, phone: string) {
  await page.goto("/fr/profil");
  await fillCandidateProfile(page, phone);
  await saveProfile(page);
  await uploadIdentityDocuments(page);

  await page.goto("/fr/verification");
  await page.getByRole("button", { name: /Recevoir mon code/ }).click();
  await page.getByRole("button", { name: "Continuer sans vérifier" }).click({ timeout: 30_000 });
  await page.waitForURL(/\/fr\/dashboard\/candidate/, { timeout: 30_000 });
}

/**
 * Choisit « Carte d'identité » puis envoie recto et verso, obligatoires pour un
 * profil complet (20261028100000_pieces_et_refus.sql). Le choix du type n'agit
 * qu'une fois la page prête, et grise les envois le temps de l'enregistrer :
 * on le refait tant que le bouton du recto reste grisé.
 */
export async function uploadIdentityDocuments(page: Page) {
  const front = page.getByRole("button", { name: /^(Envoyer|Remplacer) le recto$/ });
  await expect(async () => {
    await page.getByLabel("Type de pièce d'identité").selectOption("cni");
    await expect(front).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  for (const side of ["recto", "verso"]) {
    await uploadVia(page, `Envoyer le ${side}`, {
      name: `${side}.png`,
      mimeType: "image/png",
      buffer: PNG_1x1,
    });
    await expect(page.getByRole("button", { name: `Remplacer le ${side}` })).toBeVisible({
      timeout: 20_000,
    });
  }
}

/**
 * Ajoute le numéro d'un employeur, obligatoire pour publier une offre, puis
 * franchit la vérification par la porte de secours (l'envoi SMS pointe vers le
 * vide en test).
 */
export async function addEmployerPhone(page: Page, phone: string) {
  await page.goto("/fr/profil");
  // Même piège que le choix du métier (fillCandidateProfile) : envoyé avant
  // que la page soit prête, l'enregistrement se perdait sans message (deux
  // échecs d'affilée sur le parcours d'embauche, run 38161463574). On
  // recommence : réenregistrer le même numéro ne change rien.
  await expect(async () => {
    // Un envoi parti avant que la page soit prête a pu la quitter.
    if (!/\/fr\/profil/.test(page.url())) await page.goto("/fr/profil");
    await page.getByLabel("Téléphone").fill(phone);
    await saveProfile(page, 5_000);
  }).toPass({ timeout: 30_000 });

  await page.goto("/fr/verification");
  await page.getByRole("button", { name: /Recevoir mon code/ }).click();
  await page.getByRole("button", { name: "Continuer sans vérifier" }).click({ timeout: 30_000 });
  await page.waitForURL(/\/fr\/dashboard\/employer/, { timeout: 30_000 });
}

/**
 * Enregistre le profil et attend la confirmation. Si le formulaire affiche une
 * erreur, ou reste bloqué sur « Enregistrement... », l'échec le dit : un simple
 * « Profil enregistré. introuvable » ne permettait pas de savoir pourquoi.
 */
export async function saveProfile(page: Page, timeout = 20_000) {
  const form = page.locator("form", {
    has: page.getByRole("button", { name: /Enregistrer mon profil|Enregistrement/ }),
  });
  const saved = form.getByText("Profil enregistré.");
  const refused = form.locator("p.text-destructive");

  await form.getByRole("button", { name: "Enregistrer mon profil" }).click();
  try {
    await expect(saved.or(refused).first()).toBeVisible({ timeout });
  } catch {
    const button = await form.getByRole("button").last().textContent();
    throw new Error(`Ni confirmation ni erreur après ${timeout} ms (bouton : « ${button?.trim()} »).`);
  }
  if (await refused.isVisible()) {
    throw new Error(`Profil refusé : ${(await refused.textContent())?.trim()}`);
  }
}

/** Les cases du profil candidat, sans enregistrer. Le quartier vient de
 *  l'inscription. */
export async function fillCandidateProfile(page: Page, phone: string) {
  await page.getByLabel("Téléphone").fill(phone);
  // Le métier d'abord : chooseMetier attend que la page réagisse, et un métier
  // resté vide bloquerait l'envoi du formulaire (case obligatoire).
  await chooseMetier(page, "Nounou");
  await page.getByLabel("Adresse précise").fill("12 rue Mbochi, derrière l'école");
  await page.getByLabel("Années d'expérience").selectOption("6 ans");
  // `exact` : « Âge du dernier enfant » contient aussi « Âge ».
  await page.getByLabel("Âge", { exact: true }).fill("32");
  await page.getByLabel("Sexe").selectOption("F");
  await page.getByLabel("Situation matrimoniale").selectOption("marie");
  // La case de l'âge du dernier enfant n'apparaît qu'avec au moins un enfant :
  // elle attend que la page ait réagi au choix.
  await expect(async () => {
    await page.getByLabel("Nombre d'enfants").selectOption("2");
    await expect(page.getByLabel("Âge du dernier enfant")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByLabel("Âge du dernier enfant").selectOption("4");
  await page.getByLabel("Disponibilité").selectOption("full_time");
  // Les jours sont des cases cachées dans leur étiquette : on touche le texte,
  // comme le ferait une candidate.
  for (const day of ["Lundi", "Mardi", "Mercredi"]) {
    await page.getByText(day, { exact: true }).click();
  }
  await page.getByLabel("Heure de début").fill("07:00");
  await page.getByLabel("Heure de fin").fill("17:00");
  await page.getByLabel("Salaire souhaité").fill("90000");
  for (const skill of ["Garde d'enfants", "Cuisine congolaise", "Repassage"]) {
    await chooseSkill(page, skill);
  }
  await page.getByLabel("Langues parlées").fill("français, lingala");
}

export async function signIn(page: Page, email: string) {
  await page.goto("/fr/login");
  await page.getByPlaceholder("email@exemple.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Smallest valid PNG, so the avatar upload exercises the real storage path
 *  and the real MIME check rather than a stubbed one. */
export const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * Dépose un fichier en passant par le bouton visible, pas par l'input caché.
 *
 * `setInputFiles` sur un input `sr-only` écrit dans le DOM et émet `change` —
 * même si React n'a pas encore hydraté la page, auquel cas aucun gestionnaire
 * n'écoute et l'envoi n'a simplement pas lieu, en silence. C'est ce qui rendait
 * le test instable après un `reload()`.
 *
 * Passer par le bouton oblige le gestionnaire à exister : c'est son onClick qui
 * ouvre le sélecteur de fichier, donc l'événement `filechooser` ne survient
 * qu'une fois la page réellement interactive.
 */
export async function uploadVia(
  page: Page,
  buttonName: string | RegExp,
  file: { name: string; mimeType: string; buffer: Buffer }
) {
  const trigger = page.getByRole("button", { name: buttonName });
  await expect(trigger).toBeEnabled();

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 20_000 }),
    trigger.click(),
  ]);

  await chooser.setFiles(file);
}

/**
 * Inscription avec un numéro au lieu d'une adresse email.
 *
 * Traverse la vérification par SMS : en test l'envoi pointe vers le vide, donc
 * la demande échoue et c'est la porte de secours qu'on emprunte — ce qui
 * vérifie au passage qu'un SMS qui n'arrive pas n'enferme personne dehors.
 */
export async function registerByPhone(page: Page, role: Role, fullName: string, phone: string) {
  await page.goto("/fr/register");

  await page.locator('select[name="role"]').selectOption(role);
  await page.getByPlaceholder("Awa Dacosta").fill(fullName);
  await page.getByLabel("Téléphone").fill(phone);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByLabel("Ville").selectOption({ label: "Brazzaville" });
  await page.getByLabel("Quartier").selectOption({ label: "Bacongo" });

  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await page.waitForURL(/\/fr\/verification/, { timeout: 30_000 });
  await page.getByRole("button", { name: /Recevoir mon code/ }).click();
  await page.getByRole("button", { name: "Continuer sans vérifier" }).click({ timeout: 30_000 });

  const dashboard = role === "employer" ? "/dashboard/employer" : "/dashboard/candidate";
  await page.waitForURL(new RegExp(`/fr${dashboard}`), { timeout: 30_000 });

  return { phone, password: PASSWORD };
}

/**
 * Touche un métier dans le choix par boutons (MetierPicker). Le composant est
 * React : touché avant que la page soit prête, le bouton ne réagit pas. On
 * recommence jusqu'à ce qu'il soit bien enfoncé.
 */
export async function chooseMetier(page: Page, metier: string) {
  const button = page.getByRole("button", { name: metier, exact: true });
  await expect(async () => {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Coche une compétence. Ce sont des interrupteurs, pas un choix unique comme
 * le métier : recliquer décocherait. On ne clique donc que tant qu'elle n'est
 * pas cochée — avant que la page soit prête, le clic ne fait rien.
 */
export async function chooseSkill(page: Page, skill: string) {
  const button = page
    .getByRole("group", { name: "Compétences" })
    .getByRole("button", { name: skill, exact: true });
  await expect(async () => {
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** « Autre… » puis un intitulé écrit, pour un métier hors de la liste. */
export async function chooseOtherMetier(page: Page, text: string) {
  await chooseMetier(page, "Autre…");
  await page.getByLabel("Autre métier").fill(text);
}

/**
 * Une vraie image PNG, assez lourde pour dépasser les plafonds d'envoi.
 *
 * PNG_1x1 ne prouve rien ici : ce qu'il faut éprouver, c'est le chemin d'une
 * photo prise au téléphone, qui pèse 3 à 6 Mo et que l'application refusait.
 * Le contenu est aléatoire, donc incompressible : une image unie se réduirait à
 * quelques octets et le test passerait sans rien montrer.
 *
 * Écrit à la main plutôt qu'avec une bibliothèque : un PNG, c'est une signature,
 * trois morceaux et un CRC par morceau. Ajouter une dépendance d'image à la
 * suite de tests coûterait plus que ces vingt lignes.
 */
export function bigPng(side = 1400) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 2; // couleur vraie, RVB
  // Une ligne porte un octet de filtre puis trois octets par pixel.
  const raw = Buffer.alloc(side * (1 + side * 3));
  for (let y = 0; y < side; y++) {
    const start = y * (1 + side * 3);
    raw[start] = 0; // filtre « aucun »
    for (let i = start + 1; i < start + 1 + side * 3; i++) {
      raw[i] = Math.floor(Math.random() * 256);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    // Niveau 1 : compresser du bruit ne gagne rien, et le niveau par défaut
    // ferait perdre plusieurs secondes à chaque test pour le même résultat.
    chunk("IDAT", deflateSync(raw, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
