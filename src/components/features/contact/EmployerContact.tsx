import { BadgeCheck, Lock, MessageCircle, Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { UnlockButton, UnlockPayment } from "@/components/features/contact/UnlockActions";
import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/auth/dal";
import { PLANS, formatPrice } from "@/lib/subscriptions/plans";
import { telLink, whatsappLink, UNLOCK_PRICE, UNVERIFIED_NUMBER } from "@/lib/contact/unlock";
import { cn } from "@/lib/utils";

type Contact = {
  has_number: boolean;
  access: "owner" | "admin" | "premium" | "unlocked" | "pending" | "declared" | "none";
  unlock_id: string | null;
  full_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  /** Absent tant que 20261011070000_phone_verified_flag.sql n'est pas passée. */
  phone_verified?: boolean;
};

const REASON: Partial<Record<Contact["access"], string>> = {
  owner: "Votre numéro, tel que le voient les candidats Premium et ceux qui l'ont débloqué.",
  admin: "Visible parce que vous êtes administratrice.",
  premium: "Inclus dans votre abonnement Premium.",
  unlocked: "Numéro débloqué pour cette offre.",
};

/**
 * Le numéro de l'employeur d'une offre, ou ce qu'il faut pour l'obtenir.
 *
 * Tout passe par job_contact(), qui ne renvoie le numéro qu'à qui y a droit :
 * la page ne reçoit jamais un numéro qu'elle devrait ensuite cacher.
 */
export async function EmployerContact({
  jobId,
  jobTitle,
  user,
  compact = false,
}: {
  jobId: string;
  jobTitle: string;
  user: SessionUser | null;
  /** Version courte, pour une carte de la liste des offres. */
  compact?: boolean;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("job_contact", { p_job_id: jobId });

  // Fonction absente (migration pas encore appliquée) ou offre invisible : on
  // n'affiche rien plutôt qu'un bloc cassé.
  if (error) return null;
  const contact = ((data ?? []) as Contact[])[0];
  if (!contact || !contact.has_number) return null;

  const visible = contact.phone || contact.whatsapp;
  const premiumPrice = formatPrice(PLANS.premium_candidate.price);

  if (compact) {
    return (
      <CompactContact
        contact={contact}
        jobId={jobId}
        jobTitle={jobTitle}
        isCandidate={user?.role === "candidate"}
        premiumPrice={premiumPrice}
      />
    );
  }

  return (
    <section id="numero" className="mt-6 rounded-2xl border border-border bg-surface p-5 scroll-mt-24">
      <h2 className="font-semibold flex items-center gap-2 mb-1">
        <Phone className="h-4 w-4 text-primary" aria-hidden />
        Numéro de l&apos;employeur
      </h2>

      {visible ? (
        <>
          <p className="text-xs text-muted-foreground mb-4">
            {REASON[contact.access]}
            {contact.phone_verified === false && (
              <span className="block text-amber-700 dark:text-amber-500">
                {UNVERIFIED_NUMBER} : il peut être inexact.
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {contact.phone && (
              <a
                href={telLink(contact.phone)}
                className={cn(buttonVariants(), "h-11 rounded-full gap-2 px-5")}
              >
                <Phone className="h-4 w-4" />
                <span className="font-mono tabular-nums">{contact.phone}</span>
              </a>
            )}
            {(contact.whatsapp || contact.phone) && (
              <a
                href={whatsappLink(
                  (contact.whatsapp || contact.phone) as string,
                  `Bonjour, je vous contacte au sujet de votre offre « ${jobTitle} » vue sur Madame Dacosta Services.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }), "h-11 rounded-full gap-2 px-5")}
              >
                <MessageCircle className="h-4 w-4 text-[#25D366]" />
                WhatsApp
              </a>
            )}
          </div>
        </>
      ) : contact.access === "pending" && contact.unlock_id ? (
        <div className="mt-3">
          <UnlockPayment unlockId={contact.unlock_id} price={UNLOCK_PRICE} declared={false} />
        </div>
      ) : contact.access === "declared" && contact.unlock_id ? (
        <div className="mt-3">
          <UnlockPayment unlockId={contact.unlock_id} price={UNLOCK_PRICE} declared />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4 flex items-start gap-2">
            <Lock className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
            Appelez directement la famille, sans attendre sa réponse dans la messagerie.
          </p>

          {user?.role === "candidate" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="font-medium text-sm mb-1">Ce numéro seulement</p>
                <p className="text-xs text-muted-foreground mb-3">
                  {formatPrice(UNLOCK_PRICE)}, une seule fois. Le numéro reste dans votre tableau de
                  bord.
                </p>
                <UnlockButton jobId={jobId} />
              </div>
              <div className="rounded-xl border-2 border-secondary/60 bg-card p-4">
                <p className="font-medium text-sm mb-1 flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4 text-secondary" aria-hidden />
                  Tous les numéros avec Premium
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  {premiumPrice} par mois : le numéro de chaque employeur, et votre profil mis en
                  avant.
                </p>
                <Link
                  href="/pricing"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "rounded-full w-full sm:w-auto"
                  )}
                >
                  Voir Premium
                </Link>
              </div>
            </div>
          ) : !user ? (
            <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "rounded-full")}>
              Se connecter pour obtenir le numéro
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">
              Le numéro des employeurs est réservé aux candidats.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Sur une carte de la liste des offres : le numéro s'il est acquis, sinon les
 * deux façons de l'obtenir. Le paiement lui-même se fait sur la page de
 * l'offre, où mène le déblocage une fois demandé.
 */
function CompactContact({
  contact,
  jobId,
  jobTitle,
  isCandidate,
  premiumPrice,
}: {
  contact: Contact;
  jobId: string;
  jobTitle: string;
  isCandidate: boolean;
  premiumPrice: string;
}) {
  const number = contact.whatsapp || contact.phone;

  if (number) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface px-4 py-3 text-sm">
        <span className="font-medium flex items-center gap-1.5">
          <Phone className="h-4 w-4 text-primary" aria-hidden />
          Numéro de l&apos;employeur
        </span>
        {contact.phone && (
          <a
            href={telLink(contact.phone)}
            className="font-mono tabular-nums text-primary hover:underline"
          >
            {contact.phone}
          </a>
        )}
        <a
          href={whatsappLink(
            number,
            `Bonjour, je vous contacte au sujet de votre offre « ${jobTitle} » vue sur Madame Dacosta Services.`
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:underline"
        >
          <MessageCircle className="h-4 w-4 text-[#25D366]" aria-hidden />
          WhatsApp
        </a>
        {contact.phone_verified === false && (
            <span className="text-xs text-amber-700 dark:text-amber-500">{UNVERIFIED_NUMBER}</span>
          )}
      </div>
    );
  }

  if (contact.access === "pending" || contact.access === "declared") {
    return (
      <div className="mt-5 rounded-2xl bg-surface px-4 py-3 text-sm flex flex-wrap items-center gap-2">
        <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
        {contact.access === "pending"
          ? "Numéro demandé : il reste à régler le paiement."
          : "Paiement du numéro en cours de vérification."}
        <Link href={`/offres/${jobId}#numero`} className="font-medium text-primary hover:underline">
          {contact.access === "pending" ? "Régler" : "Voir"} →
        </Link>
      </div>
    );
  }

  if (!isCandidate) return null;

  return (
    <div className="mt-5 rounded-2xl border border-secondary/50 bg-secondary/10 px-4 py-3">
      <p className="text-sm font-medium flex items-center gap-1.5 mb-3">
        <Lock className="h-4 w-4 text-secondary" aria-hidden />
        Appelez directement l&apos;employeur
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <UnlockButton jobId={jobId} next={`/offres/${jobId}#numero`} size="sm" />
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <BadgeCheck className="h-4 w-4 text-secondary" aria-hidden />
          Tous les numéros avec Premium · {premiumPrice}/mois
        </Link>
      </div>
    </div>
  );
}
