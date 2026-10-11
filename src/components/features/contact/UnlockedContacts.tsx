import { MessageCircle, Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import { telLink, whatsappLink, UNVERIFIED_NUMBER } from "@/lib/contact/unlock";

export type UnlockedContact = {
  job_id: string;
  job_title: string;
  full_name: string;
  phone: string | null;
  whatsapp: string | null;
  phone_verified?: boolean;
};

/**
 * Les numéros que le candidat a payés. Gardés ici parce qu'une offre fermée
 * ou échue disparaît du site, alors que le numéro, lui, reste acquis.
 */
export function UnlockedContacts({ contacts }: { contacts: UnlockedContact[] }) {
  if (contacts.length === 0) return null;

  return (
    <section className="bg-card rounded-3xl border border-border shadow-soft p-6 sm:p-7 mt-6">
      <h2 className="font-semibold mb-4">
        Numéros débloqués{" "}
        <span className="text-muted-foreground font-normal">({contacts.length})</span>
      </h2>
      <ul className="divide-y divide-border">
        {contacts.map((contact) => (
          <li
            key={contact.job_id}
            className="py-4 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-medium">{contact.full_name}</p>
              <Link
                href={`/offres/${contact.job_id}`}
                className="text-xs text-muted-foreground hover:text-primary"
              >
                {contact.job_title}
              </Link>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {contact.phone && (
                <a
                  href={telLink(contact.phone)}
                  className="inline-flex items-center gap-1.5 font-mono tabular-nums text-primary hover:underline"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  {contact.phone}
                </a>
              )}
              {(contact.whatsapp || contact.phone) && (
                <a
                  href={whatsappLink(
                    (contact.whatsapp || contact.phone) as string,
                    `Bonjour, je vous contacte au sujet de votre offre « ${contact.job_title} » vue sur Madame Dacosta Services.`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <MessageCircle className="h-4 w-4 text-[#25D366]" aria-hidden />
                  WhatsApp
                </a>
              )}
              {contact.phone_verified === false && (
            <span className="text-xs text-amber-700 dark:text-amber-500">{UNVERIFIED_NUMBER}</span>
          )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
