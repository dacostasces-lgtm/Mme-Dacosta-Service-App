import "server-only";

import { cache } from "react";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

export type UserRole = "admin" | "employer" | "candidate";

export type SessionUser = {
  /** `auth.users.id` */
  id: string;
  email: string | null;
  /** `profiles.id` — null if the signup trigger hasn't run for this user. */
  profileId: string | null;
  role: UserRole;
  fullName: string;
  isPremium: boolean;
};

export function dashboardPathFor(role: UserRole) {
  return role === "employer" ? "/dashboard/employer" : "/dashboard/candidate";
}

/**
 * Reads the signed-in user and their profile. Memoized per render pass so a
 * layout and its pages share a single round-trip.
 *
 * Returns null when nobody is signed in, or when Supabase isn't configured
 * (fresh clone without .env.local) so public pages keep rendering.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const supabase = await createClient();

  // getUser() revalidates the token with Supabase — unlike getSession(), which
  // trusts the cookie and must not be used for authorization.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, is_premium")
    .eq("user_id", user.id)
    .maybeSingle();

  // Signup metadata is the fallback while the profile row is being created.
  const metadata = user.user_metadata ?? {};

  return {
    id: user.id,
    email: user.email ?? null,
    profileId: profile?.id ?? null,
    role: (profile?.role ?? metadata.role ?? "candidate") as UserRole,
    fullName:
      profile?.full_name ||
      metadata.full_name ||
      user.email?.split("@")[0] ||
      "Utilisateur",
    isPremium: profile?.is_premium ?? false,
  };
});

/**
 * Guards a page: sends anonymous visitors to the login page, and users with the
 * wrong role to their own dashboard. Admins pass every role gate — they have no
 * dashboard of their own, so redirecting them would bounce between the two.
 */
export async function requireUser(options?: { role?: UserRole }): Promise<SessionUser> {
  const locale = await getLocale();
  const user = await getCurrentUser();

  // `redirect` throws, but next-intl's inferred types don't advertise `never`,
  // so returning the call is what tells TypeScript the flow stops here.
  if (!user) {
    return redirect({ href: "/login", locale });
  }

  if (options?.role && user.role !== options.role && user.role !== "admin") {
    return redirect({ href: dashboardPathFor(user.role), locale });
  }

  return user;
}
