"use server";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/profile/completeness";
import { IDENTITY_TYPE_VALUES, isDocumentKind } from "@/lib/candidates/documents";
import type { FileState } from "@/lib/profile/files";

const NOT_YET =
  "L'envoi des pièces n'est pas encore activé sur cette base (migration 20261028100000_pieces_et_refus.sql).";

/**
 * Enregistre le chemin d'une pièce que le navigateur vient de déposer dans le
 * seau privé `pieces`.
 *
 * Même contrat que setCv : le dépôt se fait côté navigateur, sous
 * `<auth.uid()>/`, et l'on ne retient ici que le chemin — vérifié contre la
 * session, puis par le déclencheur de la table, qui refuse un fichier hors du
 * dossier du titulaire.
 *
 * Pas de `revalidatePath` : appelé depuis la page de profil, il retiendrait
 * la réponse (voir src/lib/bookings/actions.ts). Le composant rafraîchit.
 */
export async function setDocument(kind: string, objectPath: string): Promise<FileState> {
  const user = await requireUser({ role: "candidate", allowUnverifiedPhone: true });
  if (!user.profileId) return { error: "Profil introuvable." };
  if (!isDocumentKind(kind)) return { error: "Pièce inconnue." };
  if (!objectPath.startsWith(`${user.id}/`)) return { error: "Fichier refusé." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidate_documents")
    .upsert({ profile_id: user.profileId, [kind]: objectPath }, { onConflict: "profile_id" });

  if (error) {
    return { error: isMissingTable(error) ? NOT_YET : `Enregistrement impossible : ${error.message}` };
  }
  return { ok: true };
}

/** La sorte de pièce : carte d'identité, passeport… Elle dit s'il faut un verso. */
export async function setIdentityType(identityType: string): Promise<FileState> {
  const user = await requireUser({ role: "candidate", allowUnverifiedPhone: true });
  if (!user.profileId) return { error: "Profil introuvable." };
  if (!(IDENTITY_TYPE_VALUES as readonly string[]).includes(identityType)) {
    return { error: "Type de pièce inconnu." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidate_documents")
    .upsert(
      { profile_id: user.profileId, identity_type: identityType },
      { onConflict: "profile_id" }
    );

  if (error) {
    return { error: isMissingTable(error) ? NOT_YET : `Enregistrement impossible : ${error.message}` };
  }
  return { ok: true };
}
