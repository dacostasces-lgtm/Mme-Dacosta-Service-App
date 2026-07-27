import { dashboardPathFor, getCurrentUser } from "@/lib/auth/dal";
import { BottomNavBar } from "./BottomNavBar";

/**
 * Mobile-only tab bar. The desktop links live in the Navbar, which hides them
 * below `md` — this takes over there.
 *
 * Server component so the account tab knows the role without shipping the
 * session to the client; getCurrentUser is memoized per render, so sharing it
 * with the Navbar costs no extra round-trip.
 */
export async function BottomNav() {
  const user = await getCurrentUser();

  return (
    <BottomNavBar
      accountHref={user ? dashboardPathFor(user.role) : "/login"}
      accountLabel={user ? "Mon compte" : "Connexion"}
      isSignedIn={Boolean(user)}
    />
  );
}
