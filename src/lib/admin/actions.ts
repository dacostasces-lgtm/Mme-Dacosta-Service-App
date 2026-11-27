"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyProfileValidated } from "@/lib/email/send";
import { absoluteUrl, DEFAULT_LOCALE } from "@/lib/site";
import { isMissingFunction } from "@/lib/profile/completeness";
import { removePersonalFiles } from "@/lib/profile/erase-files";
import { relireEtRegler } from "@/lib/payments/actions";

/** Réponse des boutons de la file de modération (ProfileDecision.tsx). */
export type ProfileDecisionState = { error?: string; ok?: boolean };

const profileIdSchema = z.string().uuid();

/**
 * Publishes a profile, or takes it back off the listing.
 *
 * The buttons only render for admins, but a server action is a public endpoint:
 * the role is re-checked here, and the database keeps two further backstops —
 * the profiles UPDATE policy, and the `protect_profile_columns` trigger, which
 * silently reverts `is_validated` for anyone who isn't an admin.
 *
 * Pas de `revalidatePath` : appelé depuis la page de modération, il empêche la
 * réponse d'atteindre le client (voir src/lib/bookings/actions.ts). Le bouton
 * rafraîchit la page lui-même une fois la réponse reçue ; les pages publiques
 * qui listent les profils se rendent à la demande.
 */
export async function setProfileValidation(
  _previous: ProfileDecisionState,
  formData: FormData
): Promise<ProfileDecisionState> {
  await requireUser({ role: "admin" });

  const profileId = profileIdSchema.safeParse(formData.get("profileId"));
  if (!profileId.success) return { error: "Profil introuvable." };
  const validated = formData.get("validated") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_validated: validated })
    .eq("id", profileId.data);

  if (error) return { error: `Impossible de mettre à jour le profil : ${error.message}` };

  // Only on publication, and only once the write succeeded. Being told your
  // profile is live is the moment the platform becomes useful to a candidate,
  // and nothing else in the app tells them.
  if (validated) {
    await notifyProfileValidated({
      profileId: profileId.data,
      siteUrl: absoluteUrl(`/${DEFAULT_LOCALE}`),
    });
  }

  return { ok: true };
}

/**
 * Confirme à la main le numéro d'un inscrit, que l'équipe vient d'appeler.
 *
 * Le SMS n'arrive pas toujours (crédit épuisé, réseau) : la porte de secours
 * laisse alors entrer sans confirmer, et le profil reste dans les inscriptions
 * non terminées de la modération. Un appel de l'équipe vaut confirmation.
 *
 * Par la clé de service, comme la confirmation par SMS
 * (confirm_phone_verification, 20261012010000_security_fixes.sql) :
 * `phone_verified_at` ne s'écrit que depuis le serveur. Pas de
 * `revalidatePath`, pour la même raison que setProfileValidation.
 */
export async function confirmPhoneByCall(
  _previous: ProfileDecisionState,
  formData: FormData
): Promise<ProfileDecisionState> {
  await requireUser({ role: "admin" });

  const profileId = profileIdSchema.safeParse(formData.get("profileId"));
  if (!profileId.success) return { error: "Profil introuvable." };

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Confirmation indisponible : SUPABASE_SERVICE_ROLE_KEY absente sur ce déploiement." };
  }

  const { data, error } = await admin
    .from("profiles")
    .update({ phone_verified_at: new Date().toISOString(), phone_otp_pin_id: null })
    .eq("id", profileId.data)
    .not("phone", "is", null)
    .select("id");

  if (error) return { error: `Impossible de confirmer le numéro : ${error.message}` };
  if (!data?.length) return { error: "Ce profil n'a pas de numéro à confirmer." };
  return { ok: true };
}

const reasonSchema = z.string().trim().max(300, "Motif trop long (300 caractères au plus).");

const NOT_YET =
  "Le refus n'est pas encore activé sur cette base (migration 20261028100000_pieces_et_refus.sql).";

/**
 * Écarte un profil de la file avant publication, avec un motif facultatif
 * que le candidat lira sur son tableau de bord. Rien n'est supprimé :
 * restoreProfile le remet en attente. Pas de `revalidatePath`, pour la même
 * raison que setProfileValidation.
 */
export async function rejectProfile(
  _previous: ProfileDecisionState,
  formData: FormData
): Promise<ProfileDecisionState> {
  await requireUser({ role: "admin" });

  const profileId = profileIdSchema.safeParse(formData.get("profileId"));
  if (!profileId.success) return { error: "Profil introuvable." };
  const reason = reasonSchema.safeParse(String(formData.get("reason") ?? ""));
  if (!reason.success) return { error: reason.error.issues[0]?.message ?? "Motif invalide." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_profile", {
    p_profile_id: profileId.data,
    p_reason: reason.data,
  });
  if (error) {
    return { error: isMissingFunction(error) ? NOT_YET : `Refus impossible : ${error.message}` };
  }
  return { ok: true };
}

/** Annule un refus : le profil revient dans la file. */
export async function restoreProfile(
  _previous: ProfileDecisionState,
  formData: FormData
): Promise<ProfileDecisionState> {
  await requireUser({ role: "admin" });

  const profileId = profileIdSchema.safeParse(formData.get("profileId"));
  if (!profileId.success) return { error: "Profil introuvable." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_profile", { p_profile_id: profileId.data });
  if (error) {
    return {
      error: isMissingFunction(error) ? NOT_YET : `Remise en attente impossible : ${error.message}`,
    };
  }
  return { ok: true };
}

const DELETE_NOT_YET =
  "La suppression des profils refusés n'est pas encore activée sur cette base (migration 20261122100000_candidats_valides_et_refus.sql).";

/**
 * Supprime définitivement un profil refusé, depuis la section « Refusés ».
 *
 * Comme une suppression demandée par la personne (delete-account.ts) : le
 * profil reste, vidé et marqué supprimé, parce que des paiements y renvoient ;
 * ses fichiers sortent des seaux et son compte de connexion est fermé.
 *
 * L'ordre est choisi pour qu'une panne en route se rattrape. Le compte de
 * connexion se ferme d'abord, puis les fichiers, puis la base efface le profil.
 * Si cette dernière étape échoue, le profil reste dans « Refusés » avec son
 * bouton, et un second toucher termine le travail ; dans l'ordre inverse, un
 * profil déjà effacé disparaissait de la liste en laissant un compte ouvert.
 */
export async function deleteRefusedProfile(
  _previous: ProfileDecisionState,
  formData: FormData
): Promise<ProfileDecisionState> {
  await requireUser({ role: "admin" });

  const profileId = profileIdSchema.safeParse(formData.get("profileId"));
  if (!profileId.success) return { error: "Profil introuvable." };

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Suppression indisponible : SUPABASE_SERVICE_ROLE_KEY absente sur ce déploiement." };
  }
  const supabase = await createClient();

  // La migration d'abord : ne rien fermer si la base ne sait pas encore effacer.
  // candidate_is_published() vient du même fichier que delete_refused_profile().
  const migration = await supabase.rpc("candidate_is_published", { p_profile_id: profileId.data });
  if (migration.error && isMissingFunction(migration.error)) return { error: DELETE_NOT_YET };

  const { data: target } = await admin
    .from("profiles")
    .select("user_id, role")
    .eq("id", profileId.data)
    .maybeSingle();
  if (!target || target.role === "admin") return { error: "Profil introuvable." };

  const { data: refus } = await admin
    .from("profile_rejections")
    .select("profile_id")
    .eq("profile_id", profileId.data)
    .maybeSingle();
  if (!refus) return { error: "Seul un profil refusé peut être supprimé ici." };

  const userId = target.user_id as string;

  // « En douceur », comme pour soi-même : la ligne reste, l'e-mail et le numéro
  // sont brouillés, les connexions fermées. Un second essai trouve le compte
  // déjà fermé, ce qui n'est pas une erreur.
  const { error: authError } = await admin.auth.admin.deleteUser(userId, true);
  if (authError && !/not.?found/i.test(authError.message)) {
    return { error: `Le compte de connexion n'a pas pu être fermé : ${authError.message}` };
  }

  await removePersonalFiles(admin, userId);

  const { error } = await supabase.rpc("delete_refused_profile", { p_profile_id: profileId.data });
  if (error) {
    return {
      error: isMissingFunction(error)
        ? DELETE_NOT_YET
        : `Suppression impossible : ${error.message}. Touchez de nouveau le bouton pour terminer.`,
    };
  }
  return { ok: true };
}

/**
 * Redemande à PawaPay l'état d'un paiement resté « en cours », depuis la page
 * des paiements reçus, et règle l'achat s'il a abouti. Même chemin que la page
 * de l'acheteur et le rappel de PawaPay : seule la réponse authentifiée de
 * PawaPay fait foi.
 */
export async function recheckPawapayDeposit(depositId: string): Promise<ProfileDecisionState> {
  await requireUser({ role: "admin" });
  if (!profileIdSchema.safeParse(depositId).success) return { error: "Paiement introuvable." };

  const result = await relireEtRegler(depositId);
  // Un échec est une réponse, pas une panne : la page l'affiche à sa place.
  if (result.error && result.status !== "FAILED") return { error: result.error };
  return { ok: true };
}

export type CandidateCheck = "identity" | "criminal_record" | "interview";

/**
 * Records — or withdraws — one of the three verifications shown on a candidate's
 * public profile. The database stamps which admin asserted it, so every claim
 * displayed to a family can be traced back to a person.
 */
export async function setCandidateCheck(
  profileId: string,
  check: CandidateCheck,
  checked: boolean
) {
  await requireUser({ role: "admin" });

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_candidate_check", {
    candidate_id: profileId,
    check_name: check,
    checked,
  });

  if (error) {
    throw new Error(`Impossible d'enregistrer la vérification : ${error.message}`);
  }

  revalidatePath("/", "layout");
}

/**
 * Settles — or rejects — a Mobile Money payment the employer declared.
 *
 * `confirmed` is the admin asserting they saw the amount land on the platform's
 * MoMo account. Rejecting clears the declaration so the employer can submit a
 * corrected reference rather than being stuck.
 */
export async function settleBookingPayment(bookingId: string, confirmed: boolean) {
  const admin = await requireUser({ role: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update(
      confirmed
        ? {
            status: "paid",
            payment_confirmed_at: new Date().toISOString(),
            payment_confirmed_by: admin.profileId,
          }
        : {
            payment_reference: null,
            payment_declared_at: null,
            payment_confirmed_at: null,
            payment_confirmed_by: null,
          }
    )
    .eq("id", bookingId)
    // Never re-settle something already paid: without this an admin could
    // stamp a second confirmation over a closed booking.
    .eq("status", "pending_payment");

  if (error) {
    throw new Error(`Impossible de mettre à jour le paiement : ${error.message}`);
  }

  revalidatePath("/", "layout");
}
