import { Link } from '@/i18n/routing';
import { Button, buttonVariants } from '@/components/ui/button';

export function Navbar() {
  return (
    <header className="fixed top-0 w-full z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-bold text-2xl text-primary tracking-tight">
            Madame Dacosta
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/candidats" className="hover:text-foreground transition-colors">Candidats</Link>
            <Link href="/offres" className="hover:text-foreground transition-colors">Offres d'emploi</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Tarifs</Link>
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <Link href="/login" className={buttonVariants({ variant: "ghost", className: "hidden sm:inline-flex rounded-full" })}>
            Connexion
          </Link>
          <Link href="/register" className={buttonVariants({ className: "rounded-full shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5" })}>
            S'inscrire
          </Link>
        </div>
      </div>
    </header>
  );
}
