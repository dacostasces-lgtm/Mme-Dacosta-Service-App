import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PASSWORD, uniqueEmail } from "./helpers";

/**
 * Le règlement automatique par PawaPay.
 *
 * Ce qui est éprouvé ici : notre moitié du circuit — qui peut ouvrir un
 * versement, avec quel montant, ce qu'un versement abouti règle, et ce qu'un
 * rappel forgé obtient. Tout cela vit en base et ne dépend d'aucun compte
 * PawaPay.
 *
 * Ce qui ne l'est pas, et pourquoi : les appels sortants vers PawaPay
 * eux-mêmes. Il y faudrait un jeton de bac à sable, et les éprouver reviendrait
 * à tester leur service plutôt que le nôtre. Le lien entre les deux — « l'état
 * rendu par PawaPay arrive bien jusqu'au règlement » — se vérifie au premier
 * paiement réel en bac à sable.
 *
 * Le point le plus important est le dernier test : un rappel ne fait pas foi.
 * L'adresse est publique, et un faux rappel disant « COMPLETED » suffirait
 * sinon à s'offrir un déblocage ou un Premium sans payer.
 */

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

type Compte = { client: SupabaseClient; profileId: string };

async function compte(role: "candidate" | "employer", nom: string): Promise<Compte> {
  const admin = service();
  const email = uniqueEmail(`pawa-${role}`);
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

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { error: erreurConnexion } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(erreurConnexion).toBeNull();

  return { client, profileId: profil!.id as string };
}

/** Un déblocage de numéro en attente de paiement, à 500 FCFA. */
async function deblocageEnAttente() {
  const admin = service();
  const employeur = await compte("employer", "Famille Pawa");
  const candidat = await compte("candidate", "Candidate Pawa");

  const { data, error } = await admin
    .from("candidate_unlocks")
    .insert({
      employer_id: employeur.profileId,
      candidate_id: candidat.profileId,
      price: 500,
      status: "pending_payment",
    })
    .select("id, price, status")
    .single();
  expect(error).toBeNull();

  return { employeur, candidat, unlock: data! };
}

const uuid = () => crypto.randomUUID();

test.describe("règlement automatique PawaPay", () => {
  test("le montant vient de la ligne achetée, jamais de l'acheteur", async () => {
    const { employeur, unlock } = await deblocageEnAttente();

    const { data, error } = await employeur.client.rpc("start_pawapay_deposit", {
      p_purpose: "candidate_unlock",
      p_target_id: unlock.id,
      p_deposit_id: uuid(),
      p_phone: "242066667788",
      p_provider: "MTN_MOMO_COG",
    });
    expect(error).toBeNull();

    // 500, celui de la ligne — l'appelant n'a aucun moyen d'en proposer un
    // autre : la fonction n'a pas de paramètre de montant.
    expect(data?.[0]).toMatchObject({ amount: 500, currency: "XAF" });
  });

  test("on ne paie pas l'achat de quelqu'un d'autre", async () => {
    const { unlock } = await deblocageEnAttente();
    const intrus = await compte("employer", "Famille Intruse");

    const { error } = await intrus.client.rpc("start_pawapay_deposit", {
      p_purpose: "candidate_unlock",
      p_target_id: unlock.id,
      p_deposit_id: uuid(),
      p_phone: "242066667788",
      p_provider: "MTN_MOMO_COG",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("pas le vôtre");
  });

  test("une seule demande en vol à la fois", async () => {
    const { employeur, unlock } = await deblocageEnAttente();

    const premier = await employeur.client.rpc("start_pawapay_deposit", {
      p_purpose: "candidate_unlock",
      p_target_id: unlock.id,
      p_deposit_id: uuid(),
      p_phone: "242066667788",
      p_provider: "MTN_MOMO_COG",
    });
    expect(premier.error).toBeNull();

    // Toucher deux fois « Payer » ferait sonner deux fois le téléphone, et
    // payer deux fois le même déblocage.
    const second = await employeur.client.rpc("start_pawapay_deposit", {
      p_purpose: "candidate_unlock",
      p_target_id: unlock.id,
      p_deposit_id: uuid(),
      p_phone: "242066667788",
      p_provider: "MTN_MOMO_COG",
    });
    expect(second.error?.code).toBe("23505");
  });

  test("un versement abouti règle l'achat, et ne le règle qu'une fois", async () => {
    const admin = service();
    const { employeur, unlock } = await deblocageEnAttente();
    const depositId = uuid();

    await employeur.client.rpc("start_pawapay_deposit", {
      p_purpose: "candidate_unlock",
      p_target_id: unlock.id,
      p_deposit_id: depositId,
      p_phone: "242066667788",
      p_provider: "MTN_MOMO_COG",
    });

    const { data: premier, error } = await admin.rpc("settle_pawapay_deposit", {
      p_deposit_id: depositId,
      p_status: "COMPLETED",
      p_provider_tx: "PP-123456",
      p_failure_code: null,
    });
    expect(error).toBeNull();
    expect(premier).toBe("COMPLETED");

    const { data: apres } = await admin
      .from("candidate_unlocks")
      .select("status, payment_confirmed_at, payment_reference")
      .eq("id", unlock.id)
      .single();
    expect(apres).toMatchObject({ status: "active", payment_reference: "PP-123456" });
    expect(apres!.payment_confirmed_at).not.toBeNull();

    // Rejoué : le rappel de PawaPay se répète, et la page de l'acheteur
    // interroge de son côté. Les deux peuvent arriver ensemble.
    const { data: second } = await admin.rpc("settle_pawapay_deposit", {
      p_deposit_id: depositId,
      p_status: "COMPLETED",
      p_provider_tx: "PP-AUTRE",
      p_failure_code: null,
    });
    expect(second).toBe("COMPLETED");
    const { data: inchange } = await admin
      .from("candidate_unlocks")
      .select("payment_reference")
      .eq("id", unlock.id)
      .single();
    expect(inchange!.payment_reference).toBe("PP-123456");
  });

  test("un versement échoué laisse l'achat payable", async () => {
    const admin = service();
    const { employeur, unlock } = await deblocageEnAttente();
    const depositId = uuid();

    await employeur.client.rpc("start_pawapay_deposit", {
      p_purpose: "candidate_unlock",
      p_target_id: unlock.id,
      p_deposit_id: depositId,
      p_phone: "242066667788",
      p_provider: "MTN_MOMO_COG",
    });
    await admin.rpc("settle_pawapay_deposit", {
      p_deposit_id: depositId,
      p_status: "FAILED",
      p_provider_tx: null,
      p_failure_code: "PAYER_LIMIT_REACHED",
    });

    const { data: toujours } = await admin
      .from("candidate_unlocks")
      .select("status")
      .eq("id", unlock.id)
      .single();
    expect(toujours!.status).toBe("pending_payment");

    // Et un nouvel essai est possible : le versement échoué n'est plus « en
    // vol », donc l'index unique ne le bloque pas.
    const reprise = await employeur.client.rpc("start_pawapay_deposit", {
      p_purpose: "candidate_unlock",
      p_target_id: unlock.id,
      p_deposit_id: uuid(),
      p_phone: "242066667788",
      p_provider: "MTN_MOMO_COG",
    });
    expect(reprise.error).toBeNull();
  });

  test("un abonnement réglé rend le compte Premium", async () => {
    const admin = service();
    const employeur = await compte("employer", "Famille Premium");
    const { data: abo } = await admin
      .from("subscriptions")
      .insert({
        profile_id: employeur.profileId,
        plan_name: "Premium Employeur",
        price: 15000,
        status: "pending_payment",
      })
      .select("id")
      .single();

    const depositId = uuid();
    await employeur.client.rpc("start_pawapay_deposit", {
      p_purpose: "subscription",
      p_target_id: abo!.id,
      p_deposit_id: depositId,
      p_phone: "242066667788",
      p_provider: "MTN_MOMO_COG",
    });
    await admin.rpc("settle_pawapay_deposit", {
      p_deposit_id: depositId,
      p_status: "COMPLETED",
      p_provider_tx: "PP-ABO-1",
      p_failure_code: null,
    });

    const { data: ligne } = await admin
      .from("subscriptions")
      .select("status, is_active, end_date")
      .eq("id", abo!.id)
      .single();
    expect(ligne).toMatchObject({ status: "active", is_active: true });
    expect(ligne!.end_date).not.toBeNull();

    const { data: profil } = await admin
      .from("profiles")
      .select("is_premium")
      .eq("id", employeur.profileId)
      .single();
    expect(profil!.is_premium).toBe(true);
  });

  test("un compte ordinaire ne peut pas régler lui-même son versement", async () => {
    const { employeur, unlock } = await deblocageEnAttente();
    const depositId = uuid();
    await employeur.client.rpc("start_pawapay_deposit", {
      p_purpose: "candidate_unlock",
      p_target_id: unlock.id,
      p_deposit_id: depositId,
      p_phone: "242066667788",
      p_provider: "MTN_MOMO_COG",
    });

    // La fonction règle de l'argent sans contrôler de rôle : son autorité est
    // l'arrivée du versement. Elle ne doit donc être atteignable que par le
    // serveur, avec la clé de service.
    const { error } = await employeur.client.rpc("settle_pawapay_deposit", {
      p_deposit_id: depositId,
      p_status: "COMPLETED",
      p_provider_tx: "PP-TRICHE",
      p_failure_code: null,
    });
    expect(error).not.toBeNull();
  });

  test("un rappel forgé ne règle rien", async ({ request }) => {
    const admin = service();
    const { employeur, unlock } = await deblocageEnAttente();
    const depositId = uuid();
    await employeur.client.rpc("start_pawapay_deposit", {
      p_purpose: "candidate_unlock",
      p_target_id: unlock.id,
      p_deposit_id: depositId,
      p_phone: "242066667788",
      p_provider: "MTN_MOMO_COG",
    });

    // Le scénario : l'adresse de rappel est publique, et quelqu'un y poste un
    // « COMPLETED » bien formé pour un versement réel mais impayé. Le serveur
    // ne retient que l'identifiant et redemande l'état à PawaPay ; faute de
    // jeton en test, la vérification échoue, et rien n'est réglé. Avec un
    // jeton, elle répondrait la vérité.
    const reponse = await request.post("/api/pawapay/callback", {
      data: { depositId, status: "COMPLETED", amount: "500", currency: "XAF" },
      failOnStatusCode: false,
    });
    expect(reponse.status()).toBe(200);

    const { data: toujours } = await admin
      .from("candidate_unlocks")
      .select("status")
      .eq("id", unlock.id)
      .single();
    expect(toujours!.status).toBe("pending_payment");

    // Un identifiant mal formé est refusé avant tout appel sortant.
    const malForme = await request.post("/api/pawapay/callback", {
      data: { depositId: "pas-un-uuid" },
      failOnStatusCode: false,
    });
    expect(malForme.status()).toBe(400);
  });
});
