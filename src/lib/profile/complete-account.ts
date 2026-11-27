"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { requireUser, dashboardPathFor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalisePhone } from "@/lib/phone";

export type CompleteAccountState = { error?: string };

/**
 * « Complétez votre compte » : le numéro et le quartier d'un employeur inscrit
 * avant qu'ils soient obligatoires (la porte /coordonnees de requireUser).
 *
 * Seules les cases qui manquent sont lues. Un numéro déjà enregistré n'est pas
 * redemandé : la colonne est révoquée, la page ne pourrait pas l'afficher.
 */
export async function completeAccount(
  _previous: CompleteAccountState,
  formData: FormData
): Promise<CompleteAccountState> {
  const [user, locale] = await Promise.all([
    requireUser({ allowIncompleteAccount: true, allowUnverifiedPhone: true }),
    getLocale(),
  ]);

  // Déjà complet (un double envoi, un onglet resté ouvert) : rien à faire ici.
  if (user.role !== "employer" || user.missingProfileFields.length === 0) {
    return redirect({ href: dashboardPathFor(user.role), locale });
  }
  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }

  const changes: { phone?: string; neighborhood_id?: string } = {};

  if (!user.hasPhone) {
    const phone = normalisePhone(String(formData.get("phone") ?? ""));
    if (!phone.ok) return { error: phone.reason };

    // Comme à l'inscription : un numéro porté par un autre compte, c'est le
    // plus souvent la même personne, inscrite deux fois.
    const admin = createAdminClient();
    if (admin) {
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("phone", phone.value)
        .neq("id", user.profileId)
        .limit(1);
      if ((existing ?? []).length > 0) {
        return {
          error:
            "Ce numéro est déjà utilisé par un autre compte. Connectez-vous avec ce compte, ou écrivez-nous.",
        };
      }
    }
    changes.phone = phone.value;
  }

  if (!user.hasNeighborhood) {
    const neighborhoodId = String(formData.get("neighborhoodId") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(neighborhoodId)) {
      return { error: "Choisissez votre quartier pour continuer." };
    }
    changes.neighborhood_id = neighborhoodId;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(changes).eq("id", user.profileId);
  if (error) {
    return { error: `Enregistrement impossible : ${error.message}` };
  }

  // Vers son espace. Un numéro tout juste donné y passe d'abord par sa
  // vérification par SMS : c'est la porte suivante de requireUser.
  return redirect({ href: dashboardPathFor(user.role), locale });
}
