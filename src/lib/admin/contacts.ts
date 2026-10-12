import type { createClient } from "@/lib/supabase/server";

/** Une ligne de admin_profile_contacts() (20261011080000_admin_contacts.sql). */
export type AdminContact = {
  profile_id: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  phone_verified: boolean;
};

export type DirectoryRow = {
  id: string;
  full_name: string;
  role: string;
  created_at: string;
  is_validated: boolean;
  is_premium: boolean;
  neighborhoods: { name: string; cities: { name: string } | null } | null;
  candidate_details: { job_title: string | null; experience: string | null } | null;
};

/** Même jointure nommée que la file de modération : `candidate_details`
 *  référence `profiles` plusieurs fois, l'embed serait sinon ambigu. */
export const DIRECTORY_SELECT =
  "id, full_name, role, created_at, is_validated, is_premium, " +
  "neighborhoods(name, cities(name)), " +
  "candidate_details!candidate_details_profile_id_fkey(job_title, experience)";

export const ROLE_LABELS: Record<string, string> = {
  candidate: "Candidat",
  employer: "Employeur",
  admin: "Admin",
};

/**
 * Les adresses précises des candidats (20261012000000_candidate_address.sql),
 * lisibles par l'administration seule. `null` tant que la table n'existe pas :
 * l'écran l'affiche alors sans adresse plutôt qu'en erreur.
 */
export async function loadCandidateAddresses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<Map<string, string> | null> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("candidate_addresses")
    .select("profile_id, address")
    .in("profile_id", ids);
  if (error) return null;
  return new Map(
    ((data ?? []) as { profile_id: string; address: string }[]).map((row) => [
      row.profile_id,
      row.address,
    ])
  );
}
