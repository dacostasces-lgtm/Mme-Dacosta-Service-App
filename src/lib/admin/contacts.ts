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
