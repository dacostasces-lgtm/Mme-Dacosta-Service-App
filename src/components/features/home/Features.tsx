import { ShieldCheck, MapPin, Star } from "lucide-react";

export function Features() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
          <div className="flex flex-col items-center">
            <div className="h-16 w-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-bold mb-4">Profils Vérifiés</h3>
            <p className="text-muted-foreground leading-relaxed">
              Tous nos candidats passent par un processus de vérification strict pour garantir votre sécurité.
            </p>
          </div>
          <div className="flex flex-col items-center">
            <div className="h-16 w-16 bg-secondary/10 flex items-center justify-center rounded-2xl mb-6">
              <MapPin className="h-8 w-8 text-secondary" />
            </div>
            <h3 className="text-2xl font-bold mb-4">Proche de vous</h3>
            <p className="text-muted-foreground leading-relaxed">
              Grâce à notre recherche GPS par quartier, trouvez le personnel disponible exactement là où vous êtes.
            </p>
          </div>
          <div className="flex flex-col items-center">
            <div className="h-16 w-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6">
              <Star className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-bold mb-4">Qualité Premium</h3>
            <p className="text-muted-foreground leading-relaxed">
              Une mise en relation directe avec les meilleurs talents, évalués et notés par la communauté.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
