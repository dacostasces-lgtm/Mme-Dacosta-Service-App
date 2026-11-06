"use server";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "@/lib/profile/completeness";

export type DeleteAccountState = { error?: string; ok?: boolean };

/** Le mot à écrire pour confirmer : une suppression ne part pas d'un toucher. */
const CONFIRMATION = "SUPPRIMER";

/** Les seaux où la personne a pu déposer des fichiers, tous sous `<auth.uid()>/`. */
const BUCKETS = ["avatars", "cvs", "pieces"] as const;

/**
 * Supprime le compte de la personne connectée, à sa demande.
 *
 * Trois temps, dans cet ordre :
 * 1. delete_my_account() (20261106100000) efface ce qui ne regarde qu'elle et
 *    vide son profil, en gardant la ligne : les paiements y renvoient, et la
 *    politique de confidentialité les conserve pour la comptabilité. Elle se
 *    rejoue sans dommage, d'où son rang : tant qu'elle n'a pas abouti, rien
 *    d'autre n'est touché, et la personne peut réessayer.
 * 2. Ses fichiers (photo, CV, pièces) sont retirés des seaux.
 * 3. Son compte de connexion est supprimé « en douceur » : la ligne reste (le
 *    profil, donc les paiements, y renvoie), mais l'e-mail et le numéro sont
 *    brouillés — libres pour une nouvelle inscription — et toutes ses
 *    connexions sont fermées.
 */
export async function deleteMyAccount(
  _previous: DeleteAccountState,
  formData: FormData
): Promise<DeleteAccountState> {
  const user = await requireUser({ allowUnverifiedPhone: true });
  if (user.role === "admin") {
    return { error: "Un compte administrateur ne se supprime pas depuis l'application." };
  }
  if (String(formData.get("confirmation") ?? "").trim().toUpperCase() !== CONFIRMATION) {
    return { error: `Écrivez ${CONFIRMATION} pour confirmer.` };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Suppression indisponible pour le moment : écrivez-nous, nous la ferons pour vous." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    return {
      error: isMissingFunction(error)
        ? "La suppression de compte n'est pas encore activée (migration 20261106100000_suppression_compte.sql)."
        : `Suppression impossible : ${error.message}`,
    };
  }

  for (const bucket of BUCKETS) {
    const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 100 });
    const paths = (files ?? []).map((file) => `${user.id}/${file.name}`);
    if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
  }

  const { error: authError } = await admin.auth.admin.deleteUser(user.id, true);
  if (authError) {
    return {
      error: `Vos informations sont effacées, mais le compte n'a pas pu être fermé (${authError.message}). Réessayez.`,
    };
  }

  // La session n'existe plus côté serveur : on efface seulement les cookies.
  await supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}
