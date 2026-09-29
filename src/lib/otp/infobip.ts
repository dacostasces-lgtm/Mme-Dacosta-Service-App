import "server-only";

import { nationalDigits } from "@/lib/phone";

/**
 * Codes à usage unique par SMS, via l'API 2FA d'Infobip.
 *
 * La génération du code, son expiration, le nombre de tentatives et la
 * limitation par numéro sont confiés à Infobip — c'est le seul intérêt de son
 * API 2FA par rapport à un simple envoi de SMS. Écrire cela nous-mêmes
 * supposerait stocker des codes, gérer leur péremption et compter les essais,
 * pour un résultat au mieux équivalent.
 *
 * L'application et le modèle de message sont créés une fois pour toutes dans le
 * compte Infobip ; leurs identifiants arrivent par l'environnement.
 */

const BASE_URL = process.env.INFOBIP_BASE_URL || "https://api.infobip.com";

function config() {
  const apiKey = process.env.INFOBIP_API_KEY;
  const applicationId = process.env.INFOBIP_2FA_APPLICATION_ID;
  const messageId = process.env.INFOBIP_2FA_MESSAGE_ID;
  return apiKey && applicationId && messageId ? { apiKey, applicationId, messageId } : null;
}

/** Permet aux appelants de masquer la fonctionnalité plutôt que d'afficher un
 *  bouton qui échouera. */
export function isOtpConfigured() {
  return config() !== null;
}

export type SendResult =
  | { ok: true; pinId: string }
  | { ok: false; error: string };

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: string; attemptsLeft?: number };

/**
 * Infobip attend le numéro au format international sans « + » ni espaces.
 * Les 9 chiffres nationaux congolais se conservent derrière le 242 — le zéro
 * initial ne disparaît pas, contrairement à la plupart des pays.
 */
function toInfobipFormat(phone: string): string | null {
  const digits = nationalDigits(phone);
  return digits ? `242${digits}` : null;
}

async function call(path: string, apiKey: string, body: unknown) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `App ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload } as { response: Response; payload: Record<string, unknown> };
}

export async function sendPin(phone: string): Promise<SendResult> {
  const settings = config();
  if (!settings) return { ok: false, error: "Vérification par SMS non configurée." };

  const to = toInfobipFormat(phone);
  if (!to) return { ok: false, error: "Numéro invalide." };

  try {
    const { response, payload } = await call("/2fa/2/pin?ncNeeded=false", settings.apiKey, {
      applicationId: settings.applicationId,
      messageId: settings.messageId,
      from: "MmeDacosta",
      to,
    });

    if (!response.ok) {
      // La limite par numéro est la seule erreur qu'il vaut la peine de
      // distinguer : elle est atteignable sans rien faire de mal.
      const text = JSON.stringify(payload);
      if (/limit/i.test(text)) {
        return {
          ok: false,
          error: "Trop de codes demandés pour ce numéro aujourd'hui. Réessayez demain.",
        };
      }
      console.error("Infobip — envoi du code refusé :", text.slice(0, 300));
      return { ok: false, error: "Envoi du code impossible pour le moment." };
    }

    const pinId = payload.pinId;
    if (typeof pinId !== "string") {
      return { ok: false, error: "Réponse inattendue du fournisseur SMS." };
    }
    return { ok: true, pinId };
  } catch (error) {
    console.error("Infobip — envoi du code :", error);
    return { ok: false, error: "Envoi du code impossible pour le moment." };
  }
}

export async function verifyPin(pinId: string, pin: string): Promise<VerifyResult> {
  const settings = config();
  if (!settings) return { ok: false, error: "Vérification par SMS non configurée." };

  try {
    const { response, payload } = await call(
      `/2fa/2/pin/${encodeURIComponent(pinId)}/verify`,
      settings.apiKey,
      { pin }
    );

    if (!response.ok) {
      console.error("Infobip — vérification refusée :", JSON.stringify(payload).slice(0, 300));
      return { ok: false, error: "Vérification impossible pour le moment." };
    }

    if (payload.verified === true) return { ok: true };

    // Un code faux revient en HTTP 200 — vérifié contre l'API réelle. Le motif
    // se lit dans `pinError`, pas dans le statut : s'appuyer sur celui-ci
    // faisait passer « code incorrect » pour une panne du fournisseur.
    const attemptsLeft =
      typeof payload.attemptsRemaining === "number" ? payload.attemptsRemaining : undefined;
    const reason = typeof payload.pinError === "string" ? payload.pinError : "";

    if (/EXPIRED/i.test(reason)) {
      return { ok: false, error: "Ce code a expiré. Demandez-en un nouveau." };
    }
    if (/NO_ATTEMPTS|ATTEMPTS_EXCEEDED/i.test(reason) || attemptsLeft === 0) {
      return { ok: false, error: "Trop d'essais. Demandez un nouveau code.", attemptsLeft };
    }
    return {
      ok: false,
      error:
        attemptsLeft === undefined
          ? "Code incorrect."
          : `Code incorrect. Il vous reste ${attemptsLeft} essai${attemptsLeft > 1 ? "s" : ""}.`,
      attemptsLeft,
    };
  } catch (error) {
    console.error("Infobip — vérification :", error);
    return { ok: false, error: "Vérification impossible pour le moment." };
  }
}
