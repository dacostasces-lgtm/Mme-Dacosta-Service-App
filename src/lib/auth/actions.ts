"use server";

import { revalidatePath } from "next/cache";
import { redirect, routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

/**
 * Clears the Supabase session cookies and returns home.
 *
 * The locale is bound by the caller rather than read from the request: server
 * actions have no route segment params, so `getLocale()` would fall back to the
 * default locale and drop `/en` users onto `/fr`.
 */
export async function signOut(locale: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // The Navbar renders the session, so every cached route needs to be refreshed.
  revalidatePath("/", "layout");

  const safeLocale = routing.locales.includes(locale as (typeof routing.locales)[number])
    ? locale
    : routing.defaultLocale;

  redirect({ href: "/", locale: safeLocale });
}
