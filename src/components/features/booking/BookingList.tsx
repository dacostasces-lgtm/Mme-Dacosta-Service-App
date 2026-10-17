import { CalendarCheck, Clock, MapPin, Star, Wallet } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { PaymentInstructions } from "@/components/features/booking/PaymentInstructions";
import { ReviewForm } from "@/components/features/reviews/ReviewForm";
import {
  bookingStage,
  contractLabel,
  formatFee,
  type BookingView,
} from "@/lib/bookings/constants";

export type BookingRow = BookingView & {
  /** L'autre partie : le candidat côté employeur, l'employeur côté candidat. */
  contrepartie: { id: string; full_name: string } | null;
};

/** Les avis déjà laissés par la personne qui regarde, par profil noté. */
export type MyReviews = Record<string, { rating: number; comment: string | null }>;

const ETATS = {
  a_payer: { label: "À régler", ton: "bg-amber-500/10 text-amber-700 dark:text-amber-500" },
  verification: {
    label: "Paiement en vérification",
    ton: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
  },
  payee: { label: "Réglée", ton: "bg-green-500/10 text-green-700 dark:text-green-500" },
  terminee: { label: "Terminée", ton: "bg-muted text-muted-foreground" },
  annulee: { label: "Annulée", ton: "bg-muted text-muted-foreground" },
} as const;

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function BookingList({
  bookings,
  role,
  reviews = {},
}: {
  bookings: BookingRow[];
  /** Côté employeur on peut encore payer ; côté candidat la liste est en lecture. */
  role: "employer" | "candidate";
  reviews?: MyReviews;
}) {
  if (bookings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {role === "employer"
          ? "Aucune réservation. Parcourez les profils et réservez le candidat qui vous convient."
          : "Aucune famille ne vous a encore réservé."}
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {bookings.map((booking) => {
        const etape = bookingStage(booking);
        const etat = ETATS[etape];
        const debut = formatDate(booking.start_date);

        return (
          <li key={booking.id} className="border border-border rounded-2xl p-5 bg-surface">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${etat.ton}`}
              >
                {etat.label}
              </span>
              <span className="font-semibold">
                {booking.contrepartie?.full_name ??
                  (role === "employer" ? "Candidat" : "Employeur")}
              </span>
              <span className="text-sm text-muted-foreground">
                {contractLabel(booking.contract_type)}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" aria-hidden />
                {formatFee(booking.amount)}
              </span>
              {debut && (
                <span className="flex items-center gap-1.5">
                  <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
                  Début {debut}
                </span>
              )}
              {booking.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {booking.address}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Demandée le {formatDate(booking.created_at)}
              </span>
            </div>

            {/* Reprendre un paiement laissé en route. Sans cela, quitter le
                tunnel rendait la réservation impossible à régler : les
                consignes n'existaient que sur l'écran de confirmation. */}
            {/* Monté pour les deux étapes : ce bloc porte l'action, et la
                revalidation qu'elle déclenche fait justement passer de l'une à
                l'autre. Le démonter au passage figerait la transition. */}
            {role === "employer" && (etape === "a_payer" || etape === "verification") && (
              <details className="mt-4" open={etape === "verification"}>
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  {etape === "verification" ? "Paiement déclaré" : "Régler cette réservation"}
                </summary>
                <div className="mt-4">
                  <PaymentInstructions
                    bookingId={booking.id}
                    amountLabel={formatFee(booking.amount)}
                    dejaDeclare={etape === "verification"}
                  />
                </div>
              </details>
            )}

            {role === "candidate" && etape === "verification" && (
              <p className="mt-3 text-sm text-muted-foreground">
                La famille a déclaré son paiement ; nous le vérifions.
              </p>
            )}

            {etape === "payee" && booking.contrepartie && (
              <Link
                href={`/messages?avec=${booking.contrepartie.id}`}
                className={buttonVariants({
                  variant: "outline",
                  className: "mt-4 h-10 rounded-full px-5",
                })}
              >
                Échanger avec {booking.contrepartie.full_name}
              </Link>
            )}

            {/* L'avis s'ouvre dès que la mission est réglée, et non seulement
                une fois terminée : c'est la condition que la base impose
                (`ont_travaille_ensemble` accepte « réglée » comme
                « terminée »), et un placement qui dure des mois ne doit pas
                attendre sa fin pour être raconté. */}
            {(etape === "payee" || etape === "terminee") && booking.contrepartie && (
              <details className="mt-4 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm font-medium text-primary flex items-center gap-1.5">
                  <Star
                    className={`h-4 w-4 ${
                      reviews[booking.contrepartie.id]
                        ? "fill-amber-400 text-amber-400"
                        : "text-primary"
                    }`}
                    aria-hidden
                  />
                  {reviews[booking.contrepartie.id]
                    ? `Votre avis : ${reviews[booking.contrepartie.id].rating}/5 — le modifier`
                    : `Laisser un avis sur ${booking.contrepartie.full_name}`}
                </summary>
                <div className="mt-4">
                  <ReviewForm
                    revieweeId={booking.contrepartie.id}
                    revieweeName={booking.contrepartie.full_name}
                    existing={reviews[booking.contrepartie.id]}
                  />
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
