import { BadgeCheck, Lock, MessageCircle, Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { UnlockButton, UnlockPayment } from "@/components/features/contact/UnlockActions";
import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/auth/dal";
import { PLANS, formatPrice } from "@/lib/subscriptions/plans";
import { telLink, whatsappLink, UNLOCK_PRICE } from "@/lib/contact/unlock";
import { cn } from "@/lib/utils";

type Contact = {
  has_number: boolean;
  access: "owner" | "admin" | "premium" | "unlocked" | "pending" | "declared" | "none";
  unlock_id: string | null;
  full_name: string | null;
  phone: string | null;
  whatsapp: string | null;
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
}: {
  jobId: string;
  jobTitle: string;
  user: SessionUser | null;
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

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-1">
        <Phone className="h-4 w-4 text-primary" aria-hidden />
        Numéro de l&apos;employeur
      </h2>

      {visible ? (
        <>
          <p className="text-xs text-muted-foreground mb-4">{REASON[contact.access]}</p>
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
