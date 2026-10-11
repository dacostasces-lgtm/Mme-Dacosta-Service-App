import { BadgeCheck, Clock, Lock, MessageCircle, Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import {
  CandidateUnlockButton,
  CandidateUnlockPayment,
} from "@/components/features/contact/CandidateUnlockActions";
import { PLANS, formatPrice } from "@/lib/subscriptions/plans";
import { telLink, whatsappLink, CANDIDATE_UNLOCK_PRICE, UNVERIFIED_NUMBER } from "@/lib/contact/unlock";
import { cn } from "@/lib/utils";

/** Une ligne de candidate_contact() (20261011090000_candidate_contact.sql). */
export type CandidateContactRow = {
  has_number: boolean;
  access: "self" | "admin" | "unlocked" | "applied" | "premium" | "pending" | "declared" | "none";
  unlock_id: string | null;
  phone: string | null;
  whatsapp: string | null;
  phone_verified: boolean;
};

const REASON: Partial<Record<CandidateContactRow["access"], string>> = {
  admin: "Visible parce que vous êtes administratrice.",
  unlocked: "Numéro débloqué.",
  applied: "Ce candidat a postulé à votre offre payée.",
  premium: "Inclus dans votre abonnement Premium.",
};

const NOTE = "order-last basis-full text-xs text-muted-foreground";

/**
 * À la place de l'ancien bouton « Contacter » de la fiche : le numéro du
 * candidat pour qui y a droit, sinon de quoi l'obtenir.
 *
 * Rendu dans la rangée de boutons de la fiche : la note passe sur sa propre
 * ligne, sous la rangée (order-last, basis-full).
 */
export function CandidateNumber({
  contact,
  viewerRole,
  candidateId,
  jobTitle,
}: {
  contact: CandidateContactRow | undefined;
  viewerRole: "visitor" | "candidate" | "employer" | "admin";
  candidateId: string;
  jobTitle: string | null;
}) {
  // Fonction absente (migration pas encore appliquée), ou pas de numéro :
  // rien à vendre ni à montrer.
  if (!contact || !contact.has_number) return null;

  const number = contact.whatsapp || contact.phone;
  if (number) {
    return (
      <>
        {contact.phone && (
          <a
            href={telLink(contact.phone)}
            className={buttonVariants({ variant: "outline", className: "h-12 rounded-full px-6 gap-2" })}
          >
            <Phone className="h-4 w-4" />
            <span className="font-mono tabular-nums">{contact.phone}</span>
          </a>
        )}
        <a
          href={whatsappLink(
            number,
            `Bonjour, j'ai vu votre profil${jobTitle ? ` (${jobTitle})` : ""} sur Madame Dacosta Services.`
          )}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", className: "h-12 rounded-full px-6 gap-2" })}
        >
          <MessageCircle className="h-4 w-4 text-[#25D366]" />
          WhatsApp
        </a>
        <p className={NOTE}>
          {REASON[contact.access]}
          {!contact.phone_verified && (
            <span className="block text-amber-700 dark:text-amber-500">
              {UNVERIFIED_NUMBER} : il peut être inexact.
            </span>
          )}
        </p>
      </>
    );
  }

  if (contact.access === "pending") {
    return (
      <a
        href="#numero"
        className={buttonVariants({ className: "h-12 rounded-full px-6 gap-2" })}
      >
        <Lock className="h-4 w-4" />
        Régler {formatPrice(CANDIDATE_UNLOCK_PRICE)} pour le numéro
      </a>
    );
  }

  if (contact.access === "declared") {
    return (
      <p className="h-12 inline-flex items-center gap-2 rounded-full bg-surface px-5 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        Paiement en cours de vérification : le numéro s&apos;affichera ici.
      </p>
    );
  }

  if (viewerRole === "employer") {
    return (
      <>
        <CandidateUnlockButton candidateId={candidateId} />
        <p className={NOTE}>
          <Link href="/pricing" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
            <BadgeCheck className="h-4 w-4 text-secondary" aria-hidden />
            Ou tous les numéros avec Premium Employeur · {formatPrice(PLANS.premium_employer.price)} / mois
          </Link>
        </p>
      </>
    );
  }

  // Un visiteur ne sait pas encore qu'il est employeur : on l'envoie se
  // connecter. Un candidat, lui, n'a rien à faire du numéro d'un autre.
  if (viewerRole === "visitor") {
    return (
      <Link
        href="/login"
        className={cn(buttonVariants(), "h-12 rounded-full px-6 gap-2")}
      >
        <Lock className="h-4 w-4" />
        Se connecter pour avoir le numéro
      </Link>
    );
  }

  return null;
}

/** Le paiement, sous l'en-tête de la fiche, une fois le numéro demandé. */
export function CandidateNumberPayment({ contact }: { contact: CandidateContactRow | undefined }) {
  if (!contact?.unlock_id || (contact.access !== "pending" && contact.access !== "declared")) {
    return null;
  }

  return (
    <div id="numero" className="mb-8 scroll-mt-24">
      <CandidateUnlockPayment unlockId={contact.unlock_id} declared={contact.access === "declared"} />
    </div>
  );
}
