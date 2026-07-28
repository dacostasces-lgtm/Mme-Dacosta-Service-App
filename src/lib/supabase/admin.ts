import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client, for the few server-side jobs that must bypass RLS.
 *
 * The key is **not** `NEXT_PUBLIC_`: it grants full access to every table, so
 * it must never reach the browser. `server-only` above turns an accidental
 * import from a client component into a build error rather than a leak.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
