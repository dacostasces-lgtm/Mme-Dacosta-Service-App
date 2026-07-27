"use client";

import { Briefcase, Home, LogIn, Search, User } from "lucide-react";
import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type Props = {
  /** Dashboard for signed-in users, login page otherwise. */
  accountHref: string;
  accountLabel: string;
  isSignedIn: boolean;
};

const LINKS = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/candidats", label: "Candidats", icon: Search },
  { href: "/offres", label: "Offres", icon: Briefcase },
] as const;

export function BottomNavBar({ accountHref, accountLabel, isSignedIn }: Props) {
  // next-intl's usePathname strips the locale prefix, so these compare against
  // the same shape as the hrefs above ("/candidats", not "/fr/candidats").
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const AccountIcon = isSignedIn ? User : LogIn;

  return (
    // pb keeps the row clear of the iPhone home indicator in standalone mode.
    <nav
      aria-label="Navigation principale"
      className="fixed bottom-0 inset-x-0 z-50 md:hidden border-t border-border bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4">
        {[...LINKS, { href: accountHref, label: accountLabel, icon: AccountIcon }].map(
          ({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                  <span className="max-w-full truncate px-1">{label}</span>
                </Link>
              </li>
            );
          }
        )}
      </ul>
    </nav>
  );
}
