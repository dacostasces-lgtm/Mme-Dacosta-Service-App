"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { requireUser, dashboardPathFor, type UserRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalisePhone } from "@/lib/phone";

export type OnboardingState = { error?: string };

/**
 * Enregistre le rôle d'un compte créé par un fournisseur externe.
 *
 * Google ne dit pas si la personne recrute ou cherche un emploi, et le rôle
 * commande tout le reste : l'espace où elle atterrit, ce qu'elle peut publier,
 * ce que la recherche remonte d'elle. D'où cette question, posée une fois.
 *
 * Les deux `allow*` évitent le renvoi en boucle : les portes de requireUser
 * mènent ici, donc elles ne peuvent pas s'appliquer ici.
 */
export async function completeOnboarding(
  _previous: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const [user, locale] = await Promise.all([
    requireUser({ allowIncompleteOnboarding: true, allowUnverifiedPhone: true }),
    getLocale(),
  ]);

  // Déjà répondu — un double envoi, ou un onglet resté ouvert. La fonction SQL
  // refuserait de toute façon ; autant renvoyer où il faut plutôt que montrer
  // « inscription déjà terminée » à quelqu'un qui vient de la terminer.
  if (user.onboardingCompletedAt) {
    return redirect({ href: dashboardPathFor(user.role), locale });
  }

  const role = String(formData.get("role") ?? "");
  if (role !== "candidate" && role !== "employer") {
    return { error: "Choisissez l'une des deux réponses pour continuer." };
  }

  // Le numéro et le quartier, obligatoires comme au formulaire d'inscription
  // (26 novembre 2026) : Google ne les donne pas, et des employeurs entraient
  // ainsi sans numéro.
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  if (!phone.ok) return { error: phone.reason };
  const neighborhoodId = String(formData.get("neighborhoodId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(neighborhoodId)) {
    return { error: "Choisissez votre quartier pour continuer." };
  }
  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }

  // Un numéro déjà porté par un autre compte : c'est le plus souvent la même
  // personne, inscrite deux fois. Le dire plutôt que de créer un doublon.
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

  const supabase = await createClient();

  // Le numéro d'abord : si le rôle échoue ensuite, la personne revient ici et
  // recommence ; dans l'autre ordre, un rôle enregistré sans numéro laissait
  // passer exactement le compte qu'on voulait éviter.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ phone: phone.value, neighborhood_id: neighborhoodId })
    .eq("id", user.profileId);
  if (profileError) {
    return { error: `Enregistrement impossible : ${profileError.message}` };
  }

  const { error } = await supabase.rpc("complete_onboarding", { p_role: role });

  if (error) {
    return { error: `Enregistrement impossible : ${error.message}` };
  }

  // Le rôle décide de la navigation et de la barre d'onglets : il faut bien
  // toute la mise en page ici.
  revalidatePath("/", "layout");
  return redirect({ href: dashboardPathFor(role as UserRole), locale });
}
