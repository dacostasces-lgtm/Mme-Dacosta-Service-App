import { Star } from "lucide-react";

export type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((valeur) => (
        <Star
          key={valeur}
          className={`h-4 w-4 ${
            valeur <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          }`}
          aria-hidden
        />
      ))}
    </span>
  );
}

/**
 * Les avis reçus, sans nommer qui les a écrits.
 *
 * Ce n'est pas une limite technique : on pourrait joindre `profiles`. C'est un
 * choix. Un employeur qui note une candidate n'a pas à voir son nom sur une
 * page publique, et la crédibilité d'un avis ne tient pas ici à sa signature
 * mais à la condition que la base impose pour l'écrire — une réservation réglée
 * entre les deux (20261015130000_avis_merites.sql). C'est cela qu'on affiche.
 *
 * S'en remettre à la RLS pour masquer le nom aurait donné le même résultat la
 * plupart du temps, mais par accident : le profil d'un employeur n'est pas
 * lisible d'un visiteur. Un employeur dont le profil est publié aurait été
 * nommé, et pas les autres.
 */
export function ReviewList({ reviews }: { reviews: ReviewRow[] }) {
  if (reviews.length === 0) return null;

  return (
    <section className="bg-card rounded-3xl p-8 border border-border shadow-soft">
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
        <Star className="h-5 w-5 text-primary" aria-hidden />
        Avis des familles
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Laissés par des familles ayant réglé une mise en relation.
      </p>

      <ul className="space-y-5">
        {reviews.map((review) => (
          <li key={review.id} className="border-t border-border pt-5 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <Stars rating={review.rating} />
              <span className="text-xs text-muted-foreground shrink-0">
                {formatMonth(review.created_at)}
              </span>
            </div>
            {review.comment ? (
              <p className="text-sm whitespace-pre-line break-words">{review.comment}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Note sans commentaire.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
