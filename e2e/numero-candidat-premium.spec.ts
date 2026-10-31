import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PASSWORD, uniqueEmail } from "./helpers";

/**
 * « Votre numéro visible gratuitement par tous les recruteurs », promis par la
 * grille commerciale au Premium Candidat.
 *
 * Longtemps la page l'annonçait sans que rien ne le fasse : seul l'abonnement
 * de l'employeur lui ouvrait les numéros, et un recruteur non abonné payait
 * 500 FCFA même pour un candidat Premium. Ces tests vérifient que la promesse
 * tient maintenant, et surtout qu'elle s'arrête aux recruteurs — un numéro
 * gratuit pour tout le monde serait ramassable par n'importe qui.
 *
 * Pas de navigateur : ce sont des droits qu'on vérifie, pas des écrans.
 */

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

type Compte = { client: SupabaseClient; profileId: string };

async function compte(
  role: "candidate" | "employer",
  options: { publie?: boolean; telephone?: string } = {}
): Promise<Compte> {
  const admin = service();
  const email = uniqueEmail(`prem-${role}`);
  const { data: cree, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: `Premium ${role}` },
  });
  expect(error).toBeNull();

  const { data: profil } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", cree.user!.id)
    .single();

  if (options.publie || options.telephone) {
    const { error: maj } = await admin
      .from("profiles")
      .update({
        ...(options.publie ? { is_validated: true } : {}),
        ...(options.telephone ? { phone: options.telephone } : {}),
      })
      .eq("id", profil!.id);
    expect(maj).toBeNull();
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { error: connexion } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(connexion).toBeNull();

  return { client, profileId: profil!.id };
}

/** Ce que l'administration pose après avoir constaté le versement. */
async function abonnerPremium(profileId: string, plan: "Premium Candidat" | "Premium Employeur") {
  const { error } = await service()
    .from("subscriptions")
    .insert({
      profile_id: profileId,
      plan_name: plan,
      price: plan === "Premium Candidat" ? 2500 : 15000,
      status: "active",
      is_active: true,
      end_date: new Date(Date.now() + 30 * 864e5).toISOString(),
    });
  expect(error).toBeNull();
}

test.describe("le Premium Candidat rend son numéro gratuit", () => {
  test("un employeur voit le numéro d'un candidat Premium sans payer", async () => {
    const candidate = await compte("candidate", { publie: true, telephone: "+242060000011" });
    const employeur = await compte("employer");

    // Avant l'abonnement : rien, et un déblocage à payer.
    const avant = await employeur.client.rpc("candidate_contact", {
      p_candidate_id: candidate.profileId,
    });
    expect(avant.error).toBeNull();
    expect(avant.data?.[0]?.access).toBe("none");
    expect(avant.data?.[0]?.phone).toBeNull();
    // Le numéro existe bien : c'est ce qui rendait le déblocage légitime.
    expect(avant.data?.[0]?.has_number).toBe(true);

    await abonnerPremium(candidate.profileId, "Premium Candidat");

    const apres = await employeur.client.rpc("candidate_contact", {
      p_candidate_id: candidate.profileId,
    });
    expect(apres.error).toBeNull();
    expect(apres.data?.[0]?.access).toBe("candidat_premium");
    expect(apres.data?.[0]?.phone).toBe("+242060000011");
  });

  test("payer ce numéro est refusé, puisqu'il est gratuit", async () => {
    const candidate = await compte("candidate", { publie: true, telephone: "+242060000012" });
    const employeur = await compte("employer");
    await abonnerPremium(candidate.profileId, "Premium Candidat");

    // La garde vit en base, pas seulement dans l'interface : rien n'empêche
    // d'appeler la fonction directement.
    const { error } = await employeur.client.rpc("request_candidate_unlock", {
      p_candidate_id: candidate.profileId,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/gratuit/i);
  });

  test("la gratuité s'arrête aux recruteurs", async () => {
    const candidate = await compte("candidate", { publie: true, telephone: "+242060000013" });
    await abonnerPremium(candidate.profileId, "Premium Candidat");

    // Un autre candidat : le numéro resterait sinon ramassable en masse par un
    // simple compte gratuit.
    const autre = await compte("candidate", { publie: true });
    const vuParUnCandidat = await autre.client.rpc("candidate_contact", {
      p_candidate_id: candidate.profileId,
    });
    expect(vuParUnCandidat.data?.[0]?.access).toBe("none");
    expect(vuParUnCandidat.data?.[0]?.phone).toBeNull();

    // Et un visiteur anonyme, qui n'a même pas de compte.
    const anonyme = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const vuParPersonne = await anonyme.rpc("candidate_contact", {
      p_candidate_id: candidate.profileId,
    });
    expect(vuParPersonne.data?.[0]?.access).toBe("none");
    expect(vuParPersonne.data?.[0]?.phone).toBeNull();
  });
});
