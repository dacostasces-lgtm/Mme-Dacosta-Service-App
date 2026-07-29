import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Transactional email, over Resend's HTTP API.
 *
 * Deliberately `fetch` rather than the SDK: one POST is the whole integration,
 * and a dependency that ships an SDK for it would be more code than this file.
 * Swapping provider means rewriting `deliver()` and nothing else.
 *
 * Everything here is best-effort. A candidate must never fail to receive a
 * message because the mail provider is down, so callers do not await a result
 * they act on — `notify*` swallows its own errors and logs them.
 */

const ENDPOINT = "https://api.resend.com/emails";

function config() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  return apiKey && from ? { apiKey, from } : null;
}

/** True when the deployment can actually send. Callers use it to skip the
 *  recipient lookup entirely rather than querying and then discarding. */
export function isEmailConfigured() {
  return config() !== null;
}

async function deliver(to: string, subject: string, html: string, text: string) {
  const settings = config();
  if (!settings) return;

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: settings.from, to, subject, html, text }),
  });

  if (!response.ok) {
    throw new Error(`Resend a répondu ${response.status} : ${await response.text()}`);
  }
}

/**
 * Looks up an address by profile id.
 *
 * Through the service-role client because `profiles.email` was revoked from
 * both API roles in 20260728010000_restrict_profile_pii.sql — which is the
 * point of that migration. Returns null when the key is absent, so a
 * deployment without it simply sends nothing.
 */
async function recipient(profileId: string) {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", profileId)
    .maybeSingle();

  return data?.email ? { email: data.email as string, name: (data.full_name as string) ?? "" } : null;
}

/** Minimal, deliberately plain markup: many recipients here read mail on a
 *  low-end Android client, and a heavy template renders worse than none. */
function layout(title: string, body: string, cta: { href: string; label: string }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f8f9fa;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#222">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#b83a9c">Madame Dacosta Services</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${title}</h1>
    <div style="font-size:15px;line-height:1.6;color:#444">${body}</div>
    <p style="margin:28px 0 0">
      <a href="${cta.href}" style="display:inline-block;background:#b83a9c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${cta.label}</a>
    </p>
    <p style="margin:28px 0 0;font-size:12px;color:#71717a">
      Vous recevez cet email parce que vous avez un compte sur Madame Dacosta Services.
    </p>
  </div></body></html>`;
}

/** Escapes user-supplied text before it goes into the HTML body above. */
function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyNewMessage(options: {
  receiverProfileId: string;
  senderName: string;
  preview: string;
  url: string;
}) {
  try {
    if (!isEmailConfigured()) return;

    const to = await recipient(options.receiverProfileId);
    if (!to) return;

    const preview = options.preview.slice(0, 200);
    const sender = escape(options.senderName);

    await deliver(
      to.email,
      `${options.senderName} vous a écrit`,
      layout(
        `${sender} vous a envoyé un message`,
        `<p style="margin:0 0 12px">« ${escape(preview)} »</p>
         <p style="margin:0">Répondez depuis votre messagerie pour poursuivre l'échange.</p>`,
        { href: options.url, label: "Lire le message" }
      ),
      `${options.senderName} vous a envoyé un message :\n\n« ${preview} »\n\nRépondez ici : ${options.url}`
    );
  } catch (error) {
    // Never surfaced to the sender: their message was saved either way.
    console.error("Notification « nouveau message » non envoyée :", error);
  }
}

export async function notifyProfileValidated(options: { profileId: string; url: string }) {
  try {
    if (!isEmailConfigured()) return;

    const to = await recipient(options.profileId);
    if (!to) return;

    await deliver(
      to.email,
      "Votre profil est en ligne",
      layout(
        "Votre profil vient d'être validé",
        `<p style="margin:0 0 12px">Bonne nouvelle${to.name ? ` ${escape(to.name)}` : ""} : votre profil est vérifié et visible par les familles.</p>
         <p style="margin:0">Elles peuvent désormais vous trouver dans la recherche par quartier et vous contacter directement.</p>`,
        { href: options.url, label: "Voir mon espace" }
      ),
      `Votre profil vient d'être validé : les familles peuvent désormais vous trouver.\n\n${options.url}`
    );
  } catch (error) {
    console.error("Notification « profil validé » non envoyée :", error);
  }
}
