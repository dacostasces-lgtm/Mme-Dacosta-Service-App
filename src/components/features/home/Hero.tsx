"use client";
import { Button, buttonVariants } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Link } from "@/i18n/routing";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-surface py-20 sm:py-32">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary via-background to-background" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-5xl md:text-7xl font-bold tracking-tight text-foreground max-w-4xl mx-auto leading-tight"
        >
          Le personnel de maison <span className="text-primary">Premium</span> près de chez vous.
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto"
        >
          Trouvez et recrutez facilement des nounous, ménagères, chauffeurs et cuisiniers de confiance, vérifiés par nos soins.
        </motion.p>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/candidats" className={buttonVariants({ size: "lg", className: "rounded-full h-14 px-8 text-lg w-full sm:w-auto shadow-xl shadow-primary/25" })}>
            Rechercher un profil
          </Link>
          <Link href="/offres/creer" className={buttonVariants({ size: "lg", variant: "outline", className: "rounded-full h-14 px-8 text-lg w-full sm:w-auto" })}>
            Déposer une offre
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
