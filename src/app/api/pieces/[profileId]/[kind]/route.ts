import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { isDocumentKind } from "@/lib/candidates/documents";
import { candidateFileUrl } from "@/lib/candidates/files";

/**
 * Ouvre une pièce justificative : un lien signé d'une minute, refait à chaque
 * clic. Un lien posé dans la page expirerait pendant qu'elle reste ouverte, et
 * en poser un par pièce et par candidat ferait autant d'appels au chargement.
 *
 * Qui la voit, c'est la base qui le dit (candidate_file_path) : le candidat,
 * l'administration, et l'employeur qui a payé. Pour tout autre, la réponse est
 * celle d'une pièce absente.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ profileId: string; kind: string }> }
) {
  const { profileId, kind } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Connexion requise.", { status: 401 });
  if (!isDocumentKind(kind)) return new NextResponse("Pièce inconnue.", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return new NextResponse("Pièce introuvable.", { status: 404 });

  const url = await candidateFileUrl(profileId, kind);
  if (!url) return new NextResponse("Pièce introuvable.", { status: 404 });

  const response = NextResponse.redirect(url);
  // Ni cache ni référent : l'adresse signée ne doit pas traîner.
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
