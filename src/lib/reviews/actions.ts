"use server";

import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { consumeDurableLimit } from "@/lib/rate-limit-durable";
import { tooManyRequestsMessage } from "@/lib/rate-limit";
import { containsPhoneNumber, PHONE_NUMBER_REFUSED } from "@/lib/contact/phone-filter";

export type ReviewState = { error?: string; ok?: boolean };

/** Ce que la base accepte : voir reviews_rating_check. */
const NOTE_MIN = 1;
const NOTE_MAX = 5;
const COMMENTAIRE_MAX = 1000;

/**
 * Laisser un avis sur l'autre partie d'une mission.
 *
 * Trois règles tiennent en base, et c'est là qu'elles doivent tenir — l'API est
 * ouverte avec la clé publique, donc tout contrôle qui ne vivrait qu'ici se
 * contournerait (20261015130000_avis_merites.sql) :
 *
 *   - l'auteur est bien celui qui écrit, et n'écrit pas sur lui-même ;
 *   - les deux ont une réservation réglée ou terminée en commun ;
 *   - un seul avis par couple, corrigeable par son auteur.
 *
 * Ce qui est ajouté ici, c'est le message : « new row violates row-level
 * security policy » ne dit rien à quelqu'un qui vient de taper un commentaire.
 */
export async function submitReview(
  revieweeId: string,
  _previous: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const user = await requireUser();

  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }
  if (revieweeId === user.profileId) {
    return { error: "On ne laisse pas d'avis sur soi-même." };
  }

  // Durable, et non en mémoire : une limite par instance se remet à zéro à
  // chaque démarrage, et ne compte pas pareil selon l'instance qui répond.
  const limite = await consumeDurableLimit(`avis:${user.id}`, 10, 3600);
  if (!limite.ok) {
    return { error: tooManyRequestsMessage(limite.retryAfterSeconds) };
  }

  const note = Number(formData.get("rating"));
  if (!Number.isInteger(note) || note < NOTE_MIN || note > NOTE_MAX) {
    return { error: "Choisissez une note de 1 à 5 étoiles." };
  }

  const commentaire = String(formData.get("comment") ?? "").trim();
  if (commentaire.length > COMMENTAIRE_MAX) {
    return { error: `Commentaire trop long (${COMMENTAIRE_MAX} caractères maximum).` };
  }
  // Doublé par un déclencheur sur la colonne (20261017100000) ; ici seulement
  // pour que le refus soit lisible.
  if (user.role !== "admin" && containsPhoneNumber(commentaire)) {
    return { error: PHONE_NUMBER_REFUSED };
  }

  const supabase = await createClient();

  // `upsert` et non `insert` : la contrainte d'unicité est là pour empêcher
  // d'empiler les avis, pas pour interdire de se relire. La politique
  // « Un avis se corrige par son auteur » autorise la mise à jour.
  const { error } = await supabase.from("reviews").upsert(
    {
      reviewer_id: user.profileId,
      reviewee_id: revieweeId,
      rating: note,
      comment: commentaire || null,
    },
    { onConflict: "reviewer_id,reviewee_id" }
  );

  if (error) {
    // 42501 et la violation de politique disent tous deux la même chose ici :
    // il n'y a pas de mission réglée entre ces deux personnes.
    if (error.code === "42501" || /row-level security/i.test(error.message)) {
      return {
        error:
          "Un avis se laisse après une mission réglée avec cette personne. " +
          "Si vous venez de régler, patientez le temps de la vérification.",
      };
    }
    return { error: `Avis non enregistré : ${error.message}` };
  }

  // Pas de `revalidatePath` ni de `refresh` ici : déclenché côté serveur depuis
  // une action rendue par la page courante, il retient la réponse et le
  // formulaire reste figé. Le composant rafraîchit lui-même une fois le
  // résultat en main — même motif que PaymentInstructions.
  return { ok: true };
}
