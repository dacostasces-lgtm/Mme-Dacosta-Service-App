import "server-only";

/**
 * Encaissement Mobile Money par PawaPay.
 *
 * Ce que cela remplace. L'acheteur transférait lui-même vers le numéro de la
 * plateforme en citant une référence, puis déclarait son versement, et
 * quelqu'un le rapprochait du relevé à la main. Ici il saisit son numéro,
 * reçoit une demande d'autorisation sur son téléphone, tape son code, et
 * PawaPay nous dit si l'argent est arrivé.
 *
 * Deux conséquences qui valent d'être dites :
 *   - il n'y a plus de numéro marchand à configurer par opérateur. Le problème
 *     « Airtel Money n'est pas configuré » disparaît : c'est le numéro de
 *     l'acheteur qui détermine l'opérateur, et PawaPay le reconnaît lui-même ;
 *   - le relais de SMS devient inutile pour ces quatre achats. Il reste en
 *     place pour les réservations, qui ne se créent plus.
 *
 * Jamais de montant venu du navigateur : `startDeposit` reçoit celui que la
 * base a lu sur la ligne achetée.
 */

const SANDBOX = "https://api.sandbox.pawapay.io";
const PRODUCTION = "https://api.pawapay.io";

/** Dix secondes : au-delà, l'acheteur attend devant un écran figé, et une
 *  requête perdue se rattrape par la vérification d'état. */
const DELAI_MS = 10_000;

function baseUrl() {
  // La valeur par défaut est le bac à sable : une variable oubliée ne doit pas
  // envoyer de vraies demandes de paiement à de vraies personnes.
  return process.env.PAWAPAY_ENV === "production" ? PRODUCTION : SANDBOX;
}

export function isPawapayConfigured() {
  return Boolean(process.env.PAWAPAY_API_TOKEN);
}

type Reponse<T> = { ok: true; data: T } | { ok: false; error: string };

async function appeler<T>(
  chemin: string,
  options: { method: "GET" | "POST"; body?: unknown }
): Promise<Reponse<T>> {
  const token = process.env.PAWAPAY_API_TOKEN;
  if (!token) return { ok: false, error: "PAWAPAY_API_TOKEN absent sur ce déploiement." };

  try {
    const reponse = await fetch(`${baseUrl()}${chemin}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(DELAI_MS),
      cache: "no-store",
    });

    const texte = await reponse.text();
    let corps: unknown = null;
    try {
      corps = texte ? JSON.parse(texte) : null;
    } catch {
      return { ok: false, error: `Réponse illisible de PawaPay (${reponse.status}).` };
    }

    if (!reponse.ok) {
      const raison = (corps as { failureReason?: { failureMessage?: string } } | null)
        ?.failureReason?.failureMessage;
      return { ok: false, error: raison ?? `PawaPay a refusé la requête (${reponse.status}).` };
    }
    return { ok: true, data: corps as T };
  } catch (cause) {
    // Un dépassement de délai n'est pas un échec de paiement : l'ordre a pu
    // partir. L'appelant ne doit donc rien conclure, seulement vérifier l'état.
    const expire = cause instanceof Error && cause.name === "TimeoutError";
    return {
      ok: false,
      error: expire
        ? "PawaPay n'a pas répondu à temps. Vérifiez votre téléphone avant de réessayer."
        : "PawaPay est injoignable pour le moment.",
    };
  }
}

export type Operateur = { country: string; provider: string; phoneNumber: string };

/**
 * Déduit l'opérateur d'un numéro.
 *
 * C'est ce qui remplace la liste de numéros marchands par opérateur : au lieu
 * d'afficher « transférez au 06… MTN », on reconnaît l'opérateur de l'acheteur
 * et la demande part chez le bon. PawaPay annonce 0,12 % d'erreur en moyenne,
 * la portabilité des numéros étant rare ici.
 */
export async function predireOperateur(numero: string): Promise<Reponse<Operateur>> {
  return appeler<Operateur>("/v2/predict-provider", {
    method: "POST",
    body: { phoneNumber: numero },
  });
}

export type InitiationDepot = {
  depositId: string;
  status: "ACCEPTED" | "REJECTED" | "DUPLICATE_IGNORED";
  failureReason?: { failureCode?: string; failureMessage?: string };
};

export async function startDeposit(options: {
  depositId: string;
  /** En unités entières de XAF : certains opérateurs refusent les décimales. */
  amount: number;
  currency: string;
  phoneNumber: string;
  provider: string;
  /** Ce que l'acheteur lira sur son téléphone. */
  customerMessage: string;
}): Promise<Reponse<InitiationDepot>> {
  return appeler<InitiationDepot>("/v2/deposits", {
    method: "POST",
    body: {
      depositId: options.depositId,
      // Chaîne, et sans décimale : le XAF n'a pas de centime, et plusieurs
      // opérateurs rejettent un montant décimal.
      amount: String(Math.round(options.amount)),
      currency: options.currency,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: options.phoneNumber,
          provider: options.provider,
        },
      },
      // Tronqué : PawaPay le fait lire à l'acheteur sur son téléphone, et les
      // opérateurs coupent les messages longs.
      customerMessage: options.customerMessage.slice(0, 22),
    },
  });
}

export type EtatDepot = {
  status: "FOUND" | "NOT_FOUND";
  data?: {
    depositId: string;
    status: "ACCEPTED" | "PROCESSING" | "IN_RECONCILIATION" | "COMPLETED" | "FAILED";
    amount: string;
    currency: string;
    providerTransactionId?: string;
    failureReason?: { failureCode?: string; failureMessage?: string };
  };
};

/**
 * L'état faisant foi, demandé à PawaPay avec notre jeton.
 *
 * C'est la seule source à laquelle le serveur se fie. Un rappel arrive sur une
 * adresse publique et n'apporte qu'un identifiant ; c'est cette requête-ci,
 * authentifiée, qui dit si l'argent est là.
 */
export async function checkDeposit(depositId: string): Promise<Reponse<EtatDepot>> {
  return appeler<EtatDepot>(`/v2/deposits/${depositId}`, { method: "GET" });
}
