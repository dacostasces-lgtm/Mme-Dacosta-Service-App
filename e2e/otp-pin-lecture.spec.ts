import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, uniqueEmail } from "./helpers";

/**
 * Le chemin que personne ne traversait.
 *
 * La vérification par SMS est restée cassée une semaine en production : la
 * colonne `phone_otp_pin_id` n'avait pas de GRANT, la relecture échouait, et
 * l'utilisateur lisait « Aucun code en attente » avec le bon code sous les
 * yeux. Aucun test ne l'a vu, parce qu'ils pointent Infobip vers le vide :
 * l'envoi échoue, donc aucune demande n'est jamais en cours, donc la relecture
 * n'est jamais tentée.
 *
 * Ces deux tests contournent Infobip plutôt que la base. L'identifiant de
 * demande est posé avec la clé de service, exactement comme le ferait un envoi
 * réussi, puis relu avec la session de l'utilisatrice — ce que fait le serveur.
 * Pas de navigateur : c'est une permission qu'on vérifie, pas un écran.
 */
test.describe("relecture de la demande de code", () => {
  const clientService = () =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

  /** Un compte confirmé, connecté, avec une demande de code en cours. */
  async function compteAvecDemande(pinId: string) {
    const admin = clientService();
    const email = uniqueEmail("otp");

    const { data: cree, error: erreurCreation } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: "candidate", full_name: "Awa Vérification" },
    });
    expect(erreurCreation).toBeNull();

    // Ce que `start_phone_verification` écrit après un envoi réussi. Posé par
    // la clé de service, seule à passer outre protect_profile_columns.
    const { error: erreurPin } = await admin
      .from("profiles")
      .update({ phone_otp_pin_id: pinId })
      .eq("user_id", cree.user!.id);
    expect(erreurPin).toBeNull();

    const utilisateur = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { error: erreurConnexion } = await utilisateur.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    expect(erreurConnexion).toBeNull();

    return utilisateur;
  }

  test("l'utilisatrice relit la sienne par la fonction gardée", async () => {
    const pinId = `pin-${Date.now()}`;
    const utilisateur = await compteAvecDemande(pinId);

    const { data, error } = await utilisateur.rpc("my_phone_otp_pin_id");

    // L'erreur d'abord : c'est elle qui manquait. Un échec ici reproduit le
    // bug à l'identique, puisque le serveur conclurait « aucune demande ».
    expect(error).toBeNull();
    expect(data).toBe(pinId);
  });

  test("la colonne reste fermée à la lecture directe", async () => {
    const pinId = `pin-${Date.now()}`;
    const utilisateur = await compteAvecDemande(pinId);

    const { error } = await utilisateur.from("profiles").select("phone_otp_pin_id").limit(1);

    // Le correctif ne doit pas avoir consisté à ouvrir la colonne : ce serait
    // exposer l'identifiant de demande de tout profil lisible. La fonction
    // gardée doit en rester le seul chemin.
    expect(error).not.toBeNull();
  });
});
