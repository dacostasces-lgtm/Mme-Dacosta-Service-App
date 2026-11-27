import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "@/lib/profile/completeness";
import { DOCUMENTS_BUCKET } from "@/lib/candidates/documents";

/** Les fichiers du dossier d'un candidat, et le seau de chacun. */
const BUCKETS = {
  cv: "cvs",
  identity_front: DOCUMENTS_BUCKET,
  identity_back: DOCUMENTS_BUCKET,
  driving_license: DOCUMENTS_BUCKET,
} as const;

export type CandidateFileKind = keyof typeof BUCKETS;

/**
 * Un lien signé d'une minute vers un fichier du dossier d'un candidat, pour
 * qui a le droit de le voir : le candidat, l'administration, et depuis le
 * 26 novembre 2026 l'employeur qui a payé (candidate_file_path,
 * 20261127100000). Null pour tout autre, comme pour un fichier absent.
 *
 * Les seaux ne laissent lire que le titulaire et l'administration : le lien se
 * signe donc avec la clé de service, et seulement après que la base a dit oui.
 */
export async function candidateFileUrl(profileId: string, kind: CandidateFileKind) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("candidate_file_path", {
    p_candidate_id: profileId,
    p_kind: kind,
  });
  let path = typeof data === "string" && data ? data : null;

  // Migration pas encore passée : le chemin d'avant, que la base ne rendait
  // qu'au titulaire et à l'administration.
  if (error && isMissingFunction(error)) {
    if (kind === "cv") {
      const { data: cv } = await supabase.rpc("candidate_cv_path", { p_profile_id: profileId });
      path = typeof cv === "string" && cv ? cv : null;
    } else {
      const { data: row } = await supabase
        .from("candidate_documents")
        .select(kind)
        .eq("profile_id", profileId)
        .maybeSingle();
      path = (row as Record<string, string | null> | null)?.[kind] ?? null;
    }
  }
  if (!path) return null;

  const signer = createAdminClient() ?? supabase;
  const { data: signed } = await signer.storage.from(BUCKETS[kind]).createSignedUrl(path, 60);
  return signed?.signedUrl ?? null;
}
