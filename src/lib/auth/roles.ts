/**
 * Role vocabulary, shared by server and client.
 *
 * Lives outside `dal.ts` because that module is `server-only`: the login form
 * needs the same mapping, and duplicating it there is how the two drifted apart
 * in the first place.
 */

export type UserRole = "admin" | "employer" | "candidate";

/**
 * Where a signed-in user belongs.
 *
 * Admins land on moderation: they have no dashboard of their own, and every
 * "my account" entry point in the app routes through here — the navbar link,
 * the mobile tab bar, and the redirects after login, signup, email confirmation
 * and password reset. Sending them to the candidate dashboard, as this did,
 * broke all six at once.
 */
export function dashboardPathFor(role: UserRole) {
  if (role === "admin") return "/admin";
  return role === "employer" ? "/dashboard/employer" : "/dashboard/candidate";
}
