import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PASSWORD, uniqueEmail } from "./helpers";

/**
 * Les failles graves de l'audit du 12 octobre 2026, rejouées.
 *
 * Toutes passaient par l'API Supabase appelée directement, avec la clé
 * publique et la session d'un compte ordinaire — sans l'interface, qui, elle,
 * se comportait bien. Ces tests font exactement ce que ferait un tricheur, et
 * vérifient que la base refuse (20261012010000_security_fixes.sql). Pas de
 * navigateur : ce sont des droits qu'on vérifie, pas des écrans.
 */

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

type Compte = { client: SupabaseClient; profileId: string };

/** Un compte confirmé et connecté, comme le serait un vrai utilisateur. */
async function compte(
  role: "candidate" | "employer",
  options: { publie?: boolean; telephone?: string } = {}
): Promise<Compte> {
  const admin = service();
  const email = uniqueEmail(`secu-${role}`);
  const { data: cree, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: `Test sécurité ${role}` },
  });
  expect(error).toBeNull();

  const { data: profil } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", cree.user!.id)
    .single();

  if (options.publie || options.telephone) {
    const { error: erreurMaj } = await admin
      .from("profiles")
      .update({
        ...(options.publie ? { is_validated: true } : {}),
        ...(options.telephone ? { phone: options.telephone } : {}),
      })
      .eq("id", profil!.id);
    expect(erreurMaj).toBeNull();
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { error: erreurConnexion } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  expect(erreurConnexion).toBeNull();

  return { client, profileId: profil!.id as string };
}

test.describe("audit de sécurité : failles graves", () => {
  test("un compte ne peut pas se déclarer « numéro vérifié » sans SMS", async () => {
    const telephone = "+242 06 555 00 01";
    const { client, profileId } = await compte("candidate", { telephone });

    // L'ancienne attaque : écrire une demande puis la confirmer soi-même.
    const debut = await client.rpc("start_phone_verification", {
      p_profile_id: profileId,
      p_phone: telephone,
      p_pin_id: "x",
    });
    expect(debut.error).not.toBeNull();
    const fin = await client.rpc("confirm_phone_verification", {
      p_profile_id: profileId,
      p_pin_id: "x",
    });
    expect(fin.error).not.toBeNull();

    const { data } = await service()
      .from("profiles")
      .select("phone_verified_at")
      .eq("id", profileId)
      .single();
    expect(data!.phone_verified_at).toBeNull();
  });

  test("un employeur ne change que l'étape d'une candidature, jamais le candidat", async () => {
    const employeur = await compte("employer");
    const candidate = await compte("candidate", { publie: true });
    const autre = await compte("candidate", { publie: true });
    const admin = service();

    const { data: offre } = await admin
      .from("jobs")
      .insert({ employer_id: employeur.profileId, title: "Nounou", description: "Test de sécurité" })
      .select("id")
      .single();
    const { data: candidature } = await admin
      .from("applications")
      .insert({ job_id: offre!.id, candidate_id: candidate.profileId })
      .select("id")
      .single();

    // Remplacer la candidate par une autre personne, pour lire son numéro.
    const triche = await employeur.client
      .from("applications")
      .update({ candidate_id: autre.profileId })
      .eq("id", candidature!.id);
    expect(triche.error).not.toBeNull();

    const etape = await employeur.client
      .from("applications")
      .update({ status: "interview" })
      .eq("id", candidature!.id);
    expect(etape.error).toBeNull();

    const { data: apres } = await admin
      .from("applications")
      .select("candidate_id, status")
      .eq("id", candidature!.id)
      .single();
    expect(apres).toEqual({ candidate_id: candidate.profileId, status: "interview" });
  });

  test("le Premium se demande au prix et pour le rôle fixés par la base", async () => {
    const employeur = await compte("employer");

    // « Premium Employeur à 100 FCFA » écrit directement dans la table.
    const triche = await employeur.client.from("subscriptions").insert({
      profile_id: employeur.profileId,
      plan_name: "Premium Employeur",
      price: 100,
    });
    expect(triche.error).not.toBeNull();

    // La formule candidat (5 000) pour un employeur : refusée.
    const mauvaiseFormule = await employeur.client.rpc("request_subscription", {
      p_plan: "premium_candidate",
    });
    expect(mauvaiseFormule.error).not.toBeNull();

    const demande = await employeur.client.rpc("request_subscription", {
      p_plan: "premium_employer",
    });
    expect(demande.error).toBeNull();

    const { data } = await service()
      .from("subscriptions")
      .select("plan_name, price, status, is_active")
      .eq("id", demande.data as string)
      .single();
    expect(data).toEqual({
      plan_name: "Premium Employeur",
      price: 25000,
      status: "pending_payment",
      is_active: false,
    });
  });

  test("une réservation naît « à régler », au prix de la plateforme", async () => {
    const employeur = await compte("employer");
    const candidate = await compte("candidate", { publie: true });
    const cachee = await compte("candidate");

    // Une réservation déjà payée, à 1 FCFA.
    const { data, error } = await employeur.client
      .from("bookings")
      .insert({
        employer_id: employeur.profileId,
        candidate_id: candidate.profileId,
        address: "Bacongo",
        amount: 1,
        status: "paid",
        payment_confirmed_at: new Date().toISOString(),
      })
      .select("amount, status, payment_confirmed_at")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ amount: 15000, status: "pending_payment", payment_confirmed_at: null });

    // Un profil pas encore publié ne se réserve pas.
    const versCachee = await employeur.client.from("bookings").insert({
      employer_id: employeur.profileId,
      candidate_id: cachee.profileId,
      address: "Bacongo",
      amount: 15000,
    });
    expect(versCachee.error).not.toBeNull();
  });
});
