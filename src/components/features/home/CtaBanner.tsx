import Image from "next/image";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import famille from "@/assets/images/famille-cuisine.jpg";

export function CtaBanner() {
  return (
    <section className="pb-20 sm:pb-28 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] isolate">
          <Image
            src={famille}
            alt=""
            placeholder="blur"
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover -z-10"
            fill
          />
          {/* Vertical on phones — a horizontal fade over a narrow card leaves
              the photo almost entirely covered. */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-overlay/95 via-overlay/70 to-overlay/25 sm:bg-gradient-to-r sm:from-overlay/90 sm:via-overlay/75 sm:to-overlay/40" />

          <div className="px-6 sm:px-12 lg:px-16 py-16 sm:py-24 max-w-2xl">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
              Votre maison mérite quelqu&apos;un de confiance.
            </h2>
            <p className="mt-5 text-lg text-white/80 leading-relaxed">
              Créez votre compte gratuitement. Les employeurs publient une offre en deux
              minutes, les candidats sont visibles dès la vérification du dossier.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link
                href="/register"
                className={buttonVariants({
                  size: "lg",
                  variant: "secondary",
                  className: "h-14 px-8 text-base rounded-full",
                })}
              >
                Créer mon compte
              </Link>
              <Link
                href="/pricing"
                className={buttonVariants({
                  size: "lg",
                  variant: "outline",
                  className:
                    "h-14 px-8 text-base rounded-full border-white/40 bg-white/5 text-white backdrop-blur-sm hover:bg-white/15 hover:text-white",
                })}
              >
                Voir les tarifs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
