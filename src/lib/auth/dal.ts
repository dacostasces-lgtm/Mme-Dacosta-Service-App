import "server-only";

import { cache } from "react";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { isOtpConfigured } from "@/lib/otp/infobip";
import { hasSkippedVerification } from "@/lib/otp/skip";
import { dashboardPathFor, type UserRole } from "@/lib/auth/roles";

// Re-exported so the existing call sites keep importing from the DAL, while the
// login form — which cannot touch a `server-only` module — shares the same
// definition rather than reimplementing it.
export { dashboardPathFor };
export type { UserRole };

export type SessionUser = {
  /** `auth.users.id` */
  id: string;
  email: string | null;
  /** `profiles.id` — null if the signup trigger hasn't run for this user. */
  profileId: string | null;
  role: UserRole;
  fullName: string;
  isPremium: boolean;
  /** Null tant que le numéro n'a pas été confirmé par code SMS. */
  phoneVerifiedAt: string | null;
};

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
    .select("id, role, full_name, is_premium, phone_verified_at")
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
    phoneVerifiedAt: (profile?.phone_verified_at as string | null) ?? null,
  };
});

/**
 * Guards a page: sends anonymous visitors to the login page, and users with the
 * wrong role to their own dashboard. Admins pass every role gate — they have no
 * dashboard of their own, so redirecting them would bounce between the two.
 */
export async function requireUser(options?: {
  role?: UserRole;
  /**
   * À ne poser que sur la page de vérification elle-même : sans cela, la
   * redirection ci-dessous la renverrait vers elle-même indéfiniment.
   */
  allowUnverifiedPhone?: boolean;
}): Promise<SessionUser> {
  const locale = await getLocale();
  const user = await getCurrentUser();

  // `redirect` throws, but next-intl's inferred types don't advertise `never`,
  // so returning the call is what tells TypeScript the flow stops here.
  if (!user) {
    return redirect({ href: "/login", locale });
  }

  // Le numéro se vérifie avant d'entrer dans son espace. C'est le seul canal
  // par lequel une mise en relation aboutit : le reporter à plus tard revient
  // à ne jamais le faire, et un profil au numéro faux occupe la modération
  // pour rien.
  //
  // Le garde-fou tient en une condition : rien ne se déclenche tant que la
  // vérification par SMS n'est pas configurée. Sans cela, une variable
  // d'environnement absente enfermerait tout le monde dehors.
  //
  // La présence d'un numéro n'est pas testée ici — la colonne `phone` est
  // révoquée en lecture depuis 20260728010000. La page de vérification s'en
  // charge : elle demande le numéro à qui n'en a pas.
  if (
    !options?.allowUnverifiedPhone &&
    !user.phoneVerifiedAt &&
    isOtpConfigured() &&
    !(await hasSkippedVerification())
  ) {
    return redirect({ href: "/verification", locale });
  }

  if (options?.role && user.role !== options.role && user.role !== "admin") {
    return redirect({ href: dashboardPathFor(user.role), locale });
  }

  return user;
}
