import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PASSWORD, uniqueEmail } from "./helpers";

/**
 * Les failles moyennes et faibles de l'audit du 12 octobre 2026, rejouées.
 *
 * Même principe que securite.spec.ts : l'API appelée directement avec la clé
 * publique et une session ordinaire, puisque c'est par là qu'on triche —
 * l'interface, elle, se tenait bien.
 */

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

type Compte = { client: SupabaseClient; profileId: string };

async function compte(role: "candidate" | "employer", publie = false): Promise<Compte> {
  const admin = service();
  const email = uniqueEmail(`moy-${role}`);
  const { data: cree, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: `Test moyen ${role}` },
  });
  expect(error).toBeNull();

  const { data: profil } = await admin
    .from("profiles").select("id").eq("user_id", cree.user!.id).single();

  if (publie) {
    await admin.from("profiles").update({ is_validated: true }).eq("id", profil!.id);
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { error: erreurConnexion } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(erreurConnexion).toBeNull();

  return { client, profileId: profil!.id as string };
}

test.describe("audit de sécurité : failles moyennes", () => {
  test("un numéro de transaction ne règle qu'un seul achat", async () => {
    const admin = service();
    const employeur = await compte("employer");
    const candidat = await compte("candidate", true);

    const { data: offre } = await admin
      .from("jobs")
      .insert({ employer_id: employeur.profileId, title: "Offre test", description: "Test" })
      .select("id").single();
    const { data: paiement } = await admin
      .from("job_payments")
      .insert({ job_id: offre!.id, employer_id: employeur.profileId, price: 5000 })
      .select("id").single();
    const { data: reservation } = await admin
      .from("bookings")
      .insert({ employer_id: employeur.profileId, candidate_id: candidat.profileId, amount: 15000 })
      .select("id").single();

    const recu = `MP${Date.now()}.A1`;

    const premier = await admin
      .from("job_payments").update({ payment_reference: recu }).eq("id", paiement!.id);
    expect(premier.error).toBeNull();

    // Le même reçu, ponctuation changée, sur une autre contrepartie.
    const rejeu = await admin
      .from("bookings")
      .update({ payment_reference: recu.replace(/[.]/g, " ").toLowerCase() })
      .eq("id", reservation!.id);
    expect(rejeu.error).not.toBeNull();

    // Un reçu neuf passe toujours : la règle ne doit pas bloquer l'usage normal.
    const autre = await admin
      .from("bookings").update({ payment_reference: `MP${Date.now()}.B2` }).eq("id", reservation!.id);
    expect(autre.error).toBeNull();
  });

  test("un avis demande une mission réglée, et ne s'écrit qu'une fois", async () => {
    const admin = service();
    const employeur = await compte("employer");
    const candidat = await compte("candidate", true);

    // Sans rien avoir partagé : refusé.
    const sansMission = await employeur.client
      .from("reviews")
      .insert({ reviewer_id: employeur.profileId, reviewee_id: candidat.profileId, rating: 1 });
    expect(sansMission.error).not.toBeNull();

    await admin.from("bookings").insert({
      employer_id: employeur.profileId,
      candidate_id: candidat.profileId,
      amount: 15000,
      status: "paid",
    });

    const premier = await employeur.client
      .from("reviews")
      .insert({ reviewer_id: employeur.profileId, reviewee_id: candidat.profileId, rating: 5 });
    expect(premier.error).toBeNull();

    // Un second avis sur la même personne : refusé.
    const second = await employeur.client
      .from("reviews")
      .insert({ reviewer_id: employeur.profileId, reviewee_id: candidat.profileId, rating: 1 });
    expect(second.error).not.toBeNull();
  });

  test("le destinataire d'un message n'en réécrit ni le texte ni l'expéditeur", async () => {
    const admin = service();
    const expediteur = await compte("employer");
    const destinataire = await compte("candidate", true);

    const { data: message } = await admin
      .from("messages")
      .insert({
        sender_id: expediteur.profileId,
        receiver_id: destinataire.profileId,
        content: "texte original",
      })
      .select("id").single();

    const falsification = await destinataire.client
      .from("messages").update({ content: "texte falsifié" }).eq("id", message!.id);
    expect(falsification.error).not.toBeNull();

    const usurpation = await destinataire.client
      .from("messages").update({ sender_id: destinataire.profileId }).eq("id", message!.id);
    expect(usurpation.error).not.toBeNull();

    const { data: apres } = await admin
      .from("messages").select("content, sender_id").eq("id", message!.id).single();
    expect(apres!.content).toBe("texte original");
    expect(apres!.sender_id).toBe(expediteur.profileId);

    // Marquer comme lu doit rester possible : c'est l'usage légitime.
    const lu = await destinataire.client
      .from("messages").update({ is_read: true }).eq("id", message!.id);
    expect(lu.error).toBeNull();
  });

  test("le compteur de limites tient entre deux instances", async () => {
    const admin = service();
    const cle = `test:${Date.now()}`;

    for (let i = 0; i < 3; i++) {
      const { data } = await admin.rpc("consume_rate_limit", { p_cle: cle, p_limite: 3, p_fenetre: 60 });
      expect(Number(data)).toBe(0);
    }

    const { data: refus } = await admin.rpc("consume_rate_limit", { p_cle: cle, p_limite: 3, p_fenetre: 60 });
    expect(Number(refus)).toBeGreaterThan(0);

    // La clé publique ne doit pas pouvoir remettre un compteur à zéro.
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { error } = await anon.rpc("consume_rate_limit", { p_cle: cle, p_limite: 999, p_fenetre: 60 });
    expect(error).not.toBeNull();
  });
});
