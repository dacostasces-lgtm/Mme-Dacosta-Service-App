export function Footer() {
  return (
    <footer className="border-t border-border mt-auto bg-surface/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold text-xl mb-4 text-primary tracking-tight">Madame Dacosta</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              La plateforme Premium de référence pour le recrutement de personnel de maison qualifié en Afrique.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Liens Rapides</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="/candidats" className="hover:text-primary transition-colors">Rechercher un profil</a></li>
              <li><a href="/offres" className="hover:text-primary transition-colors">Déposer une offre</a></li>
              <li><a href="/pricing" className="hover:text-primary transition-colors">Tarifs Premium</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Légal</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="/cgu" className="hover:text-primary transition-colors">CGU</a></li>
              <li><a href="/privacy" className="hover:text-primary transition-colors">Confidentialité</a></li>
              <li><a href="/legal" className="hover:text-primary transition-colors">Mentions Légales</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Contact & Support</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="https://wa.me/1234567890" target="_blank" rel="noopener noreferrer" className="hover:text-[#25D366] transition-colors flex items-center gap-2">WhatsApp Support</a></li>
              <li><a href="mailto:contact@madamedacosta.com" className="hover:text-primary transition-colors">contact@madamedacosta.com</a></li>
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
