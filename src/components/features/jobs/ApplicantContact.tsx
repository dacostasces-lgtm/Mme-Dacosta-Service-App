import { Lock, MessageCircle, Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import { telLink, whatsappLink } from "@/lib/contact/unlock";
import { JOB_PRICE } from "@/lib/jobs/payment";
import { formatPrice } from "@/lib/subscriptions/plans";

export type ApplicantContactRow = {
  application_id: string;
  job_id: string;
  paid: boolean;
  phone: string | null;
  whatsapp: string | null;
};

/**
 * Le numéro d'un candidat, sous sa candidature : affiché si l'offre est
 * payante, sinon l'invitation à la passer en payante. Le numéro vient de
 * my_applicant_contacts(), qui ne le renvoie que pour une offre payée.
 */
export function ApplicantContact({
  contact,
  jobId,
  jobTitle,
}: {
  contact: ApplicantContactRow | undefined;
  jobId: string;
  jobTitle: string;
}) {
  if (contact?.paid) {
    const number = contact.whatsapp || contact.phone;
    if (!number) {
      return (
        <p className="text-xs text-muted-foreground mt-2">
          Ce candidat n&apos;a pas renseigné de numéro : répondez-lui par la messagerie.
        </p>
      );
    }
    return (
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        {contact.phone && (
          <a
            href={telLink(contact.phone)}
            className="inline-flex items-center gap-1.5 font-mono tabular-nums text-primary hover:underline"
          >
            <Phone className="h-4 w-4" aria-hidden />
            {contact.phone}
          </a>
        )}
        <a
          href={whatsappLink(
            number,
            `Bonjour, je vous contacte au sujet de votre candidature à mon offre « ${jobTitle} » sur Madame Dacosta Services.`
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:underline"
        >
          <MessageCircle className="h-4 w-4 text-[#25D366]" aria-hidden />
          WhatsApp
        </a>
      </div>
    );
  }

  return (
    <p className="mt-2 text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
      <Lock className="h-3.5 w-3.5" aria-hidden />
      Numéro masqué (offre gratuite).
      <Link href={`/offres/${jobId}/payer`} className="font-medium text-primary hover:underline">
        Passer cette offre en payante · {formatPrice(JOB_PRICE)}
      </Link>
    </p>
  );
}
