import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Les seaux où une personne a pu déposer des fichiers, tous sous `<auth.uid()>/`. */
const BUCKETS = ["avatars", "cvs", "pieces"] as const;

/**
 * Retire des seaux la photo, le CV et les pièces d'un compte qu'on supprime —
 * qu'il se supprime lui-même (delete-account.ts) ou que l'administration
 * supprime un profil refusé (admin/actions.ts). Avec la clé de service : les
 * fichiers ne sont pas ceux de la personne qui agit.
 */
export async function removePersonalFiles(admin: SupabaseClient, userId: string) {
  for (const bucket of BUCKETS) {
    const { data: files } = await admin.storage.from(bucket).list(userId, { limit: 100 });
    const paths = (files ?? []).map((file) => `${userId}/${file.name}`);
    if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
  }
}
