import { NextResponse } from "next/server";
import { relireEtRegler } from "@/lib/payments/actions";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Rappel de PawaPay : un versement a atteint son état final.
 *
 * Le corps du rappel n'est pas cru, et c'est le point important de ce fichier.
 * PawaPay signe ses rappels en RFC 9421, mais la signature se désactive depuis
 * leur tableau de bord, sa vérification est délicate à faire juste, et cette
 * adresse est publique. Un rappel forgé disant « COMPLETED » suffirait sinon à
 * s'offrir un déblocage, une offre ou un Premium sans payer.
 *
 * On n'en retient donc que l'identifiant du versement, puis on redemande son
 * état à PawaPay avec notre jeton. Un faux rappel ne déclenche au pire qu'une
 * vérification qui répond la vérité — ou un NOT_FOUND sur un identifiant
 * inventé, qui ne règle rien.
 *
 * Répond toujours 200 une fois le corps lu : PawaPay retente sur autre chose,
 * et un rappel qu'on ne sait pas traiter ne se traitera pas mieux au deuxième
 * essai. Ce qui compte est consigné dans `pawapay_deposits`.
 */
export async function POST(request: Request) {
  // L'adresse est publique et la vérification d'état coûte un appel sortant :
  // un seau unique pour tout le point d'entrée, large pour ne jamais gêner les
  // rappels légitimes, qui se comptent en dizaines par jour.
  const seau = rateLimit("pawapay-callback", { limit: 120, windowSeconds: 60 });
  if (!seau.ok) {
    return NextResponse.json(
      { error: "Trop de requêtes." },
      { status: 429, headers: { "Retry-After": String(seau.retryAfterSeconds) } }
    );
  }

  let corps: { depositId?: unknown };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON illisible." }, { status: 400 });
  }

  const depositId = typeof corps.depositId === "string" ? corps.depositId : null;
  // Un UUID, et rien d'autre : l'identifiant part dans un chemin d'URL chez
  // PawaPay et dans une requête SQL.
  if (!depositId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(depositId)) {
    return NextResponse.json({ error: "depositId manquant ou mal formé." }, { status: 400 });
  }

  const resultat = await relireEtRegler(depositId);
  return NextResponse.json({ depositId, status: resultat.status ?? "unknown" });
}
