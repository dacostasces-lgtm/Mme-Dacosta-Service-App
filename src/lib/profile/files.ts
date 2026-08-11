"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type FileState = { error?: string; ok?: boolean };

/**
 * Records the storage path of a file the browser has just uploaded.
 *
 * The upload itself happens client-side against Supabase Storage, where the
 * bucket policies pin the first folder segment to `auth.uid()`. This action
 * only writes the resulting URL, and re-derives the path from the session
 * rather than trusting the one posted back — otherwise any signed-in user could
 * point their profile at somebody else's file.
 */
export async function setAvatar(objectPath: string): Promise<FileState> {
  const user = await requireUser();
  if (!user.profileId) return { error: "Profil introuvable." };

  const expectedPrefix = `${user.id}/`;
  if (!objectPath.startsWith(expectedPrefix)) {
    return { error: "Fichier refusé." };
  }

  const supabase = await createClient();
  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(objectPath);

  // Cache-busting: the path is stable across replacements (same file name), so
  // without this the old photo keeps showing until the CDN entry expires.
  const url = `${publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.profileId);

  if (error) return { error: `Enregistrement impossible : ${error.message}` };

  // La page de profil seulement, pas le layout entier. Une révalidation de
  // layout remonte FileUploads, ce qui efface l'aperçu local juste posé — et
  // si le nouveau avatar_url n'est pas encore redescendu, l'écran retombe sur
  // les initiales sans jamais réafficher la photo. Les autres pages qui
  // montrent l'avatar sont rendues à la demande, elles la verront d'elles-mêmes.
  revalidatePath("/[locale]/profil", "page");
  return { ok: true };
}

/** Same contract for the CV, except the bucket is private so the stored value
 *  is the object path — a URL would expire. */
export async function setCv(objectPath: string): Promise<FileState> {
  const user = await requireUser({ role: "candidate" });
  if (!user.profileId) return { error: "Profil introuvable." };

  if (!objectPath.startsWith(`${user.id}/`)) {
    return { error: "Fichier refusé." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidate_details")
    .upsert({ profile_id: user.profileId, cv_url: objectPath }, { onConflict: "profile_id" });

  if (error) return { error: `Enregistrement impossible : ${error.message}` };

  revalidatePath("/[locale]/profil", "page");
  return { ok: true };
}

/** Short-lived link to a private CV. The owner and admins are the only callers
 *  the storage policy lets through, so no extra check is needed here. */
export async function cvSignedUrl(objectPath: string): Promise<string | null> {
  await requireUser();

  const supabase = await createClient();
  const { data } = await supabase.storage.from("cvs").createSignedUrl(objectPath, 60 * 10);
  return data?.signedUrl ?? null;
}
