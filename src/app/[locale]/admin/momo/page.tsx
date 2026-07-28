import { AlertTriangle, ArrowLeft, CheckCircle2, CircleSlash, Copy } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

type SmsEvent = {
  id: string;
  received_at: string;
  sender: string | null;
  body: string;
  parsed_amount: number | null;
  parsed_reference: string | null;
  booking_id: string | null;
  outcome: string;
  note: string | null;
};

const OUTCOMES: Record<
  string,
  { label: string; tone: string; icon: typeof CheckCircle2 }
> = {
  matched: {
    label: "Réservation réglée",
    tone: "text-green-700 dark:text-green-500 bg-green-500/10",
    icon: CheckCircle2,
  },
  amount_mismatch: {
    label: "Montant incorrect",
    tone: "text-amber-700 dark:text-amber-500 bg-amber-500/10",
    icon: AlertTriangle,
  },
  unmatched: {
    label: "Aucune correspondance",
    tone: "text-muted-foreground bg-muted",
    icon: CircleSlash,
  },
  duplicate: {
    label: "Doublon ignoré",
    tone: "text-muted-foreground bg-muted",
    icon: Copy,
  },
};

function formatMoment(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MomoLogPage() {
  await requireUser({ role: "admin" });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("momo_sms_events")
    .select(
      "id, received_at, sender, body, parsed_amount, parsed_reference, booking_id, outcome, note"
    )
    .order("received_at", { ascending: false })
    .limit(100);

  const events = (data ?? []) as SmsEvent[];
  const needsAttention = events.filter(
    (event) => event.outcome === "unmatched" || event.outcome === "amount_mismatch"
  ).length;

  return (
    <div className="flex-1 bg-surface bg-grain">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/admin"
          className={buttonVariants({
            variant: "ghost",
            className: "rounded-full gap-2 mb-4 -ml-2",
          })}
        >
          <ArrowLeft className="h-4 w-4" />
          Modération
        </Link>

        <h1 className="text-3xl font-bold mb-2">Encaissements Mobile Money</h1>
        <p className="text-muted-foreground mb-8">
          Les SMS relayés depuis la SIM marchand. Un paiement dont la référence et le
          montant correspondent exactement règle la réservation tout seul ; le reste
          atterrit ici et dans la file de vérification manuelle.
          {needsAttention > 0 && (
            <span className="block mt-2 font-medium text-foreground">
              {needsAttention} message{needsAttention > 1 ? "s" : ""} demande
              {needsAttention > 1 ? "nt" : ""} votre attention.
            </span>
          )}
        </p>

        {error && (
          <div className="bg-card border border-border rounded-2xl p-6 text-sm mb-8">
            <p className="font-medium mb-1">Journal indisponible.</p>
            <p className="text-muted-foreground">
              La migration{" "}
              <code className="font-mono">20260728020000_momo_sms_settlement</code> n&apos;est
              pas encore appliquée. Lancez <code className="font-mono">supabase db push</code>.
            </p>
            <p className="text-muted-foreground/70 mt-2 font-mono text-xs">{error.message}</p>
          </div>
        )}

        {!error && events.length === 0 ? (
          <div className="bg-card border border-border rounded-3xl p-10 text-center shadow-soft">
            <p className="font-medium mb-1">Aucun SMS reçu pour l&apos;instant.</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Vérifiez que l&apos;application de relais tourne sur le téléphone qui porte la
              SIM marchand et qu&apos;elle pointe vers <code className="font-mono">/api/momo/sms</code>.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => {
              const outcome = OUTCOMES[event.outcome] ?? OUTCOMES.unmatched;
              const Icon = outcome.icon;

              return (
                <article
                  key={event.id}
                  className="bg-card border border-border rounded-2xl p-5 shadow-soft"
                >
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${outcome.tone}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {outcome.label}
                    </span>
                    {event.parsed_reference && (
                      <span className="font-mono text-sm text-primary">
                        {event.parsed_reference}
                      </span>
                    )}
                    {event.parsed_amount !== null && (
                      <span className="text-sm font-semibold">
                        {new Intl.NumberFormat("fr-FR").format(event.parsed_amount)} FCFA
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {event.sender ?? "expéditeur inconnu"} · {formatMoment(event.received_at)}
                    </span>
                  </div>

                  {event.note && (
                    <p className="text-sm text-muted-foreground mb-2">{event.note}</p>
                  )}

                  {/* The raw text is what you retune the parser against. */}
                  <p className="text-xs font-mono text-muted-foreground bg-surface border border-border rounded-lg p-3 whitespace-pre-wrap break-words">
                    {event.body}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
