"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { requireUser, dashboardPathFor, type UserRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding", { p_role: role });

  if (error) {
    return { error: `Enregistrement impossible : ${error.message}` };
  }

  // Le rôle décide de la navigation et de la barre d'onglets : il faut bien
  // toute la mise en page ici.
  revalidatePath("/", "layout");
  return redirect({ href: dashboardPathFor(role as UserRole), locale });
}
