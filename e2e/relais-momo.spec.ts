import { expect, test, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PASSWORD, uniqueEmail } from "./helpers";

/**
 * Le relais de SMS Mobile Money, qui règle les réservations tout seul.
 *
 * C'était le seul chemin par lequel de l'argent change d'état sans qu'aucun
 * test ne passe : un SMS arrive sur la SIM marchand, le téléphone le transmet à
 * `POST /api/momo/sms`, et la réservation correspondante passe à « réglée »
 * sans intervention humaine. Le reste du circuit commercial est couvert par
 * reservation.spec.ts, modération comprise ; celui-ci ne l'était pas.
 *
 * Ce qui n'est pas couvert ici, et pourquoi :
 *
 *   - le plafond quotidien de règlements automatiques. Il repose sur
 *     `consume_rate_limit`, déjà éprouvé par securite-moyennes.spec.ts, et
 *     l'épuiser demanderait onze réservations pour ne rien prouver de plus. Le
 *     plafond est relevé dans scripts/e2e.sh pour que l'ordre des tests ne
 *     fasse pas échouer la suite ;
 *   - le téléphone qui transmet réellement les SMS. C'est une installation
 *     physique, hors de portée d'un test.
 */

const SECRET = "secret-de-test-du-relais-momo-0000";

const service = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

async function profil(role: "candidate" | "employer", nom: string) {
  const admin = service();
  const { data: cree, error } = await admin.auth.admin.createUser({
    email: uniqueEmail(`momo-${role}`),
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: nom },
  });
  expect(error).toBeNull();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", cree.user!.id)
    .single();
  return data!.id as string;
}

/** Une réservation impayée, et la référence que l'employeur doit citer. */
async function reservationImpayee(montant = 15000) {
  const admin = service();
  const employeur = await profil("employer", "Famille relais");
  const candidat = await profil("candidate", "Candidate relais");

  const { data, error } = await admin
    .from("bookings")
    .insert({
      employer_id: employeur,
      candidate_id: candidat,
      amount: montant,
      status: "pending_payment",
    })
    .select("id, status, amount")
    .single();
  expect(error).toBeNull();

  // La même formule que paymentReference() côté application, et que la
  // fonction settle_booking_from_sms côté base.
  const reference = `MD-${(data!.id as string).replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  return { id: data!.id as string, reference, montant };
}

async function relayer(
  request: APIRequestContext,
  corps: { from?: string; body?: string },
  secret: string | null = SECRET
) {
  return request.post("/api/momo/sms", {
    headers: secret === null ? {} : { "x-momo-relay-secret": secret },
    data: corps,
    failOnStatusCode: false,
  });
}

async function statut(id: string) {
  const { data } = await service()
    .from("bookings")
    .select("status, payment_confirmed_at, payment_reference")
    .eq("id", id)
    .single();
  return data!;
}

test.describe("relais de SMS Mobile Money", () => {
  test("sans le bon secret, rien ne passe", async ({ request }) => {
    const sansEntete = await relayer(request, { from: "MobileMoney", body: "x" }, null);
    expect(sansEntete.status()).toBe(401);

    const mauvais = await relayer(
      request,
      { from: "MobileMoney", body: "x" },
      // Même longueur que le vrai : la comparaison est à temps constant, et un
      // secret plus court emprunterait un autre chemin dans le code.
      "secret-de-test-du-relais-momo-XXXX"
    );
    expect(mauvais.status()).toBe(401);
  });

  test("un SMS d'un expéditeur inconnu est ignoré", async ({ request }) => {
    const { reference, montant } = await reservationImpayee();

    // Le scénario réel : le numéro marchand est imprimé sur l'écran de
    // paiement, donc n'importe qui peut écrire à cette SIM, et le relais
    // transmet de bonne foi. La liste des expéditeurs est tout ce qui sépare un
    // règlement d'un SMS forgé.
    const reponse = await relayer(request, {
      from: "+242060000000",
      body: `Vous avez recu ${montant} FCFA. Ref ${reference}. ID transaction MP250101.1234`,
    });
    expect(reponse.status()).toBe(200);
    expect(await reponse.json()).toMatchObject({ outcome: "ignored", reason: "sender" });
  });

  test("un SMS de débit ne règle rien", async ({ request }) => {
    const { id, reference, montant } = await reservationImpayee();

    // Une SIM marchand reçoit aussi des débits et des soldes. Régler sur
    // ceux-là marquerait des réservations payées à mesure que l'argent sort.
    const reponse = await relayer(request, {
      from: "MobileMoney",
      body: `Transfert de ${montant} FCFA effectue. Ref ${reference}. Solde 2000 FCFA`,
    });
    expect(await reponse.json()).toMatchObject({ outcome: "ignored", reason: "not_a_credit" });
    expect((await statut(id)).status).toBe("pending_payment");
  });

  test("un SMS valide règle la réservation, et une seule fois", async ({ request }) => {
    const { id, reference, montant } = await reservationImpayee();

    const corps = {
      from: "MobileMoney",
      body:
        `Solde precedent 1 200 F. Vous avez recu ${montant.toLocaleString("fr-FR")} FCFA ` +
        `de 066667788. Ref: ${reference}. ID transaction: MP260101.1530.A54321`,
    };

    const reponse = await relayer(request, corps);
    expect(reponse.status()).toBe(200);
    const resultat = await reponse.json();
    expect(resultat).toMatchObject({ outcome: "matched", bookingId: id });
    // Le solde précédent ouvre le message : lire le premier montant du texte
    // donnerait 1200 et le règlement échouerait en amount_mismatch.
    expect(resultat.parsed).toMatchObject({ amount: montant, reference });
    expect(resultat.parsed.transactionId).toBe("MP260101.1530.A54321");

    const apres = await statut(id);
    expect(apres.status).toBe("paid");
    expect(apres.payment_confirmed_at).not.toBeNull();
    expect(apres.payment_reference).toBe("MP260101.1530.A54321");

    // Rejoué — ce que fait une application de relais quand elle doute d'avoir
    // abouti. Le même SMS ne doit pas compter deux fois.
    const rejeu = await relayer(request, corps);
    expect(await rejeu.json()).toMatchObject({ outcome: "duplicate" });

    const { count } = await service()
      .from("momo_sms_events")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", id);
    expect(count).toBe(1);
  });

  test("un montant qui ne correspond pas ne règle pas", async ({ request }) => {
    const { id, reference, montant } = await reservationImpayee();

    const reponse = await relayer(request, {
      from: "MobileMoney",
      body: `Vous avez recu ${montant - 5000} FCFA. Ref ${reference}. ID transaction MP260102.0900.B1`,
    });
    expect(await reponse.json()).toMatchObject({ outcome: "amount_mismatch" });
    expect((await statut(id)).status).toBe("pending_payment");
  });

  test("une référence inconnue laisse la trace sans rien régler", async ({ request }) => {
    const { id } = await reservationImpayee();

    const reponse = await relayer(request, {
      from: "MobileMoney",
      body: "Vous avez recu 15000 FCFA. Ref MD-ZZZZZZ. ID transaction MP260103.1100.C2",
    });
    expect(await reponse.json()).toMatchObject({ outcome: "unmatched" });
    expect((await statut(id)).status).toBe("pending_payment");

    // La trace existe quand même : c'est elle que la modération lit pour
    // rattraper un paiement que le relais n'a pas su rapprocher.
    const { data } = await service()
      .from("momo_sms_events")
      .select("outcome, note, parsed_reference")
      .eq("parsed_reference", "MD-ZZZZZZ")
      .single();
    expect(data).toMatchObject({ outcome: "unmatched" });
    expect(data!.note).toContain("Aucune réservation impayée");
  });
});
