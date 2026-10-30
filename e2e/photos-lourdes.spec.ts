import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { bigPng, register, uploadVia, uniqueEmail } from "./helpers";

/**
 * Une photo prise au téléphone doit passer.
 *
 * Ce que les tests existants prouvaient : qu'un PNG de 1×1 pixel s'envoie. Ce
 * qu'ils ne prouvaient pas, et que les inscrites vivaient : une vraie photo
 * pèse 3 à 6 Mo, le seau des avatars est plafonné à 2, et l'application
 * refusait le fichier sans rien en faire. Les gens remplissaient tout leur
 * profil, l'envoi échouait, et l'inscription restait « non terminée ».
 *
 * L'image de ces tests fait près de 6 Mo et son contenu est aléatoire, donc
 * incompressible : une image unie se réduirait à quelques octets et le test
 * passerait sans rien éprouver.
 */

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const AVATAR_MAX = 2 * 1024 * 1024;

test.describe("photos lourdes", () => {
  test("photo de profil et pièce d'identité de 6 Mo s'envoient toutes deux", async ({ page }) => {
    // Une seule inscription pour les deux envois : le parcours complet prend
    // une trentaine de secondes, et le refaire n'éprouverait rien de plus.
    const email = uniqueEmail("photo-candidate");
    await register(page, "candidate", "Photo Lourde", email);

    const photo = bigPng(1400);
    // Le garde-fou du test lui-même : si l'image fabriquée passait déjà sous le
    // plafond, le reste ne prouverait rien.
    expect(photo.length).toBeGreaterThan(AVATAR_MAX * 2);

    const admin = service();
    const { data: profil } = await admin
      .from("profiles")
      .select("id, user_id")
      .eq("full_name", "Photo Lourde")
      .single();

    // --- la photo de profil ---------------------------------------------------
    await page.goto("/fr/profil");
    await uploadVia(page, /photo/i, {
      name: "IMG_4821.png",
      mimeType: "image/png",
      buffer: photo,
    });

    // Les messages que voyaient les inscrites. Ils ne doivent plus apparaître.
    await expect(page.getByText(/trop lourd/i)).toHaveCount(0);
    await expect(page.getByText(/Envoi impossible/i)).toHaveCount(0);

    await expect(async () => {
      const { data } = await admin.storage.from("avatars").list(profil!.user_id as string);
      expect(data?.length ?? 0).toBeGreaterThan(0);
      const envoye = data![0];
      const taille = (envoye.metadata as { size?: number } | null)?.size ?? 0;
      expect(taille).toBeGreaterThan(0);
      expect(taille).toBeLessThanOrEqual(AVATAR_MAX);
      // Réencodée en JPEG par le canevas, quel que soit le format d'origine :
      // c'est ce qui règle aussi le HEIC des iPhone, qu'aucun seau n'accepte.
      expect(envoye.name).toMatch(/\.jpg$/);
    }).toPass({ timeout: 30_000 });

    // --- la pièce d'identité --------------------------------------------------
    // Le type de pièce d'abord : les boutons d'envoi n'apparaissent qu'ensuite.
    await page.getByLabel(/Type de pièce/i).selectOption("cni");
    await uploadVia(page, /recto/i, {
      name: "IMG_4822.png",
      mimeType: "image/png",
      buffer: photo,
    });

    await expect(page.getByText(/trop lourd/i)).toHaveCount(0);
    await expect(page.getByText(/Envoi impossible/i)).toHaveCount(0);

    await expect(async () => {
      const { data } = await admin
        .from("candidate_documents")
        .select("identity_front")
        .eq("profile_id", profil!.id)
        .maybeSingle();
      expect(data?.identity_front).toBeTruthy();
    }).toPass({ timeout: 30_000 });
  });
});
