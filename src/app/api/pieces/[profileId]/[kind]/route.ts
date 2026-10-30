import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET, isDocumentKind } from "@/lib/candidates/documents";

/**
 * Ouvre une pièce justificative : un lien signé d'une minute, refait à chaque
 * clic. Un lien posé dans la page expirerait pendant qu'elle reste ouverte, et
 * en poser un par pièce et par candidat ferait autant d'appels au chargement.
 *
 * Aucun contrôle à refaire ici : la table et le seau ne laissent lire que le
 * titulaire et l'administration (20261028100000). Pour tout autre, la ligne
 * n'existe pas — d'où la même réponse qu'une pièce absente.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ profileId: string; kind: string }> }
) {
  const { profileId, kind } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Connexion requise.", { status: 401 });
  if (!isDocumentKind(kind)) return new NextResponse("Pièce inconnue.", { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("candidate_documents")
    .select(kind)
    .eq("profile_id", profileId)
    .maybeSingle();

  const path = (data as Record<string, string | null> | null)?.[kind];
  if (!path) return new NextResponse("Pièce introuvable.", { status: 404 });

  const { data: signed } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 60);
  if (!signed?.signedUrl) return new NextResponse("Pièce introuvable.", { status: 404 });

  const response = NextResponse.redirect(signed.signedUrl);
  // Ni cache ni référent : l'adresse signée ne doit pas traîner.
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
