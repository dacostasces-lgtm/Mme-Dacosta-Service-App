import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { candidateFileUrl } from "@/lib/candidates/files";

/**
 * Ouvre le CV d'un candidat : un lien signé d'une minute, refait à chaque clic,
 * comme les pièces (api/pieces). Pour le candidat, l'administration — qui lit
 * aussi les dossiers des offres internationales — et l'employeur qui a payé ;
 * pour tout autre, la réponse est celle d'un CV absent.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Connexion requise.", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return new NextResponse("CV introuvable.", { status: 404 });

  const url = await candidateFileUrl(profileId, "cv");
  if (!url) return new NextResponse("CV introuvable.", { status: 404 });

  const response = NextResponse.redirect(url);
  // Ni cache ni référent : l'adresse signée ne doit pas traîner.
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
