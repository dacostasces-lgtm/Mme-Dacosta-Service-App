import { COMPANY } from "@/lib/legal/company";
import { Link } from "@/i18n/routing";
import { ShareButton } from "@/components/shared/ShareButton";
import { localisedUrl } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto bg-surface bg-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-display font-bold text-2xl mb-4 text-primary tracking-tight">
              Madame Dacosta
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              La plateforme Premium de référence pour le recrutement de personnel de maison qualifié au Congo.
            </p>
            <ShareButton
              url={localisedUrl("/")}
              title="Madame Dacosta Services"
              text="Pour trouver du personnel de maison vérifié, ou un emploi de maison près de chez soi :"
              label="Partager l'application"
              size="sm"
              align="left"
              className="mt-4 [&_button]:h-9 [&_button]:px-4"
            />
          </div>
          <div>
            <h4 className="font-semibold mb-4">Liens Rapides</h4>
            {/* next-intl's Link, not a raw <a>: a bare href drops the locale
                prefix and every one of these ends on a 404. */}
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/candidats" className="hover:text-primary transition-colors">Rechercher un profil</Link></li>
              <li><Link href="/offres/creer" className="hover:text-primary transition-colors">Déposer une offre</Link></li>
              <li><Link href="/pricing" className="hover:text-primary transition-colors">Tarifs Premium</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Légal</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/cgu" className="hover:text-primary transition-colors">CGU</Link></li>
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Confidentialité</Link></li>
              <li><Link href="/legal" className="hover:text-primary transition-colors">Mentions Légales</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Contact & Support</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                {/* wa.me wants the international number without "+" or spaces.
                    Congo-Brazzaville mobiles keep their leading 0 after the
                    242 country code. */}
                <a
                  href={`https://wa.me/${COMPANY.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#25D366] transition-colors flex items-center gap-2"
                >
                  WhatsApp · {COMPANY.phone}
                </a>
              </li>
              <li>
                {/* Une seule source : l'adresse figure aussi sur les pages
                    légales, et la redupliquer ici est ce qui l'avait laissée
                    sur l'ancien domaine. */}
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="hover:text-primary transition-colors"
                >
                  {COMPANY.email}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Madame Dacosta Services. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}
