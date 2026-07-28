import { getLocale } from 'next-intl/server';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button, buttonVariants } from '@/components/ui/button';
import { getCurrentUser, dashboardPathFor } from '@/lib/auth/dal';
import { signOut } from '@/lib/auth/actions';

export async function Navbar() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  return (
    <header className="fixed top-0 w-full z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-display font-bold text-2xl text-primary tracking-tight">
            Madame Dacosta
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/candidats" className="hover:text-foreground transition-colors">Candidats</Link>
            <Link href="/offres" className="hover:text-foreground transition-colors">Offres d&apos;emploi</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Tarifs</Link>
          </nav>
        </div>

        {user ? (
          <div className="flex items-center gap-2 sm:gap-4">
            {user.role === 'admin' && (
              <Link
                href="/admin"
                className={buttonVariants({ variant: "ghost", className: "rounded-full gap-2 text-primary" })}
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Modération</span>
              </Link>
            )}
            <Link
              href={dashboardPathFor(user.role)}
              className={buttonVariants({ variant: "ghost", className: "h-10 rounded-full gap-2 px-1 sm:px-3" })}
            >
              <span className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold uppercase">
                {user.fullName.charAt(0)}
              </span>
              <span className="hidden sm:inline max-w-32 truncate">{user.fullName}</span>
            </Link>
            <form action={signOut.bind(null, locale)}>
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Se déconnecter"
                title="Se déconnecter"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link href="/login" className={buttonVariants({ variant: "ghost", className: "hidden sm:inline-flex rounded-full" })}>
              Connexion
            </Link>
            <Link href="/register" className={buttonVariants({ className: "rounded-full shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5" })}>
              S&apos;inscrire
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
