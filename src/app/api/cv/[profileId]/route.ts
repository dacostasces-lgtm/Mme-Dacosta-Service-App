import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * Ouvre le CV d'un candidat : un lien signé d'une minute, refait à chaque clic,
 * comme les pièces (api/pieces). Pour l'administration, qui lit les dossiers
 * des offres internationales, et pour le candidat lui-même.
 *
 * candidate_cv_path() ne rend le chemin qu'à eux (20261124100000), et la
 * politique du seau `cvs` ne les laisse lire qu'eux : pour tout autre, la
 * réponse est celle d'un CV absent.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Connexion requise.", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return new NextResponse("CV introuvable.", { status: 404 });

  const supabase = await createClient();
  const { data: path } = await supabase.rpc("candidate_cv_path", { p_profile_id: profileId });
  if (typeof path !== "string" || !path) return new NextResponse("CV introuvable.", { status: 404 });

  const { data: signed } = await supabase.storage.from("cvs").createSignedUrl(path, 60);
  if (!signed?.signedUrl) return new NextResponse("CV introuvable.", { status: 404 });

  const response = NextResponse.redirect(signed.signedUrl);
  // Ni cache ni référent : l'adresse signée ne doit pas traîner.
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
