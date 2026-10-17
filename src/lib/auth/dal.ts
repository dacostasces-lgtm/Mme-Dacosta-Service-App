import "server-only";

import { cache } from "react";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { isOtpConfigured } from "@/lib/otp/infobip";
import { hasSkippedVerification } from "@/lib/otp/skip";
import { dashboardPathFor, type UserRole } from "@/lib/auth/roles";
import { missingCandidateFields } from "@/lib/profile/completeness";

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
  /** Présence d'un numéro, sans sa valeur : la colonne `phone` est révoquée. */
  hasPhone: boolean;
  /**
   * Null tant que le rôle n'a pas été choisi. Ne concerne en pratique que les
   * comptes créés par un fournisseur externe : le formulaire impose le rôle,
   * donc le déclencheur d'inscription horodate aussitôt.
   */
  onboardingCompletedAt: string | null;
  /**
   * Cases obligatoires encore vides : celles du profil candidat
   * (src/lib/profile/completeness.ts), ou le seul téléphone pour un employeur.
   * Toujours vide pour un admin.
   */
  missingProfileFields: string[];
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
    .select(
      "id, role, full_name, is_premium, phone_verified_at, phone_present, onboarding_completed_at, neighborhood_id"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // Signup metadata is the fallback while the profile row is being created.
  const metadata = user.user_metadata ?? {};

  // Complétude du profil, pour un candidat seulement. Une lecture qui échoue
  // (colonne absente le temps d'une migration) ne doit enfermer personne :
  // on considère alors le profil complet.
  let missingProfileFields: string[] = [];
  // Un employeur n'a qu'une case obligatoire : son numéro.
  if (profile?.role === "employer" && !profile.phone_present) {
    missingProfileFields = ["Téléphone"];
  }
  if (profile?.role === "candidate") {
    // Par la fonction, pas par la table : `age` et `gender` n'y sont plus
    // lisibles depuis 20261017110000, et la lecture directe échouait donc en
    // entier. L'échec étant avalé par le `if (!error)` ci-dessous, la complétude
    // paraissait acquise et personne n'était plus averti d'un profil à finir.
    const [{ data: details, error }, addressResult] = await Promise.all([
      supabase.rpc("my_candidate_details").then((result) => ({
        data: result.data?.[0] ?? null,
        error: result.error,
      })),
      supabase
        .from("candidate_addresses")
        .select("address")
        .eq("profile_id", profile.id)
        .maybeSingle(),
    ]);
    if (!error) {
      const row = (details ?? {}) as Record<string, unknown>;
      missingProfileFields = missingCandidateFields({
        phonePresent: Boolean(profile.phone_present),
        neighborhoodId: profile.neighborhood_id as string | null,
        // Lecture impossible (table pas encore créée) : on ne réclame pas une
        // case que personne ne pourrait remplir.
        address: addressResult.error
          ? "?"
          : ((addressResult.data?.address as string | undefined) ?? null),
        jobTitle: row.job_title as string | null,
        experience: row.experience as string | null,
        age: row.age as number | null,
        gender: row.gender as string | null,
        availability: row.availability as string | null,
        desiredSalary: row.desired_salary as number | null,
        skills: row.skills,
        languages: row.languages,
        workDays: row.work_days,
        startTime: row.start_time as string | null,
        endTime: row.end_time as string | null,
      });
    }
  }

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
    hasPhone: Boolean(profile?.phone_present),
    // Un profil pas encore écrit n'est pas un rôle à choisir : renvoyer null
    // ici enverrait vers /bienvenue le temps que le déclencheur passe, et le
    // choix porterait sur une ligne qui n'existe pas.
    onboardingCompletedAt: profile
      ? ((profile.onboarding_completed_at as string | null) ?? null)
      : new Date(0).toISOString(),
    missingProfileFields,
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
  /**
   * À ne poser que sur /bienvenue et son action, pour la même raison que
   * ci-dessus : la redirection renverrait la page vers elle-même.
   */
  allowIncompleteOnboarding?: boolean;
}): Promise<SessionUser> {
  const locale = await getLocale();
  const user = await getCurrentUser();

  // `redirect` throws, but next-intl's inferred types don't advertise `never`,
  // so returning the call is what tells TypeScript the flow stops here.
  if (!user) {
    return redirect({ href: "/login", locale });
  }

  // Avant tout le reste : un compte arrivé par Google porte le rôle par
  // défaut, que personne n'a choisi. Le laisser entrer, c'est installer un
  // employeur dans l'espace candidat — et `role` étant gelé par un
  // déclencheur, il n'en sortirait plus. La porte ne se déclenche que si la
  // colonne est nulle, ce qui n'arrive jamais pour une inscription au
  // formulaire.
  if (!options?.allowIncompleteOnboarding && !user.onboardingCompletedAt) {
    return redirect({ href: "/bienvenue", locale });
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
  // `hasPhone` vient d'une colonne calculée qui n'expose que la présence, pas
  // la valeur : `phone` reste révoquée. Sans ce test, un compte créé avec une
  // adresse email seule serait renvoyé sans fin vers un écran lui réclamant un
  // code pour un numéro qui n'existe pas.
  if (
    !options?.allowUnverifiedPhone &&
    user.hasPhone &&
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
