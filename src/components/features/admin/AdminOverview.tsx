import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  MessageSquareText,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Link } from "@/i18n/routing";

type Props = {
  /** null when the queue's migration isn't applied yet — not the same as zero. */
  payments: number | null;
  subscriptions: number | null;
  profiles: number;
};

type Item = {
  href: string;
  label: string;
  singular: string;
  plural: string;
  count: number | null;
  icon: typeof Wallet;
  /** Someone has already paid and is waiting, so this outranks the rest. */
  urgent?: boolean;
};

export function AdminOverview({ payments, subscriptions, profiles }: Props) {
  const items: Item[] = [
    {
      href: "#paiements",
      label: "Paiements",
      singular: "paiement à vérifier",
      plural: "paiements à vérifier",
      count: payments,
      icon: Wallet,
      urgent: true,
    },
    {
      href: "#abonnements",
      label: "Abonnements",
      singular: "abonnement à vérifier",
      plural: "abonnements à vérifier",
      count: subscriptions,
      icon: CheckCircle2,
      urgent: true,
    },
    {
      href: "#profils",
      label: "Profils",
      singular: "profil à publier",
      plural: "profils à publier",
      count: profiles,
      icon: UserCheck,
    },
  ];

  const waiting = items.filter((item) => (item.count ?? 0) > 0);
  // Money first: a family has paid and cannot reach the candidate until someone
  // confirms it, whereas an unpublished profile only delays that candidate.
  waiting.sort((a, b) => Number(b.urgent ?? false) - Number(a.urgent ?? false));

  // A queue whose migration is missing reads as `null`, and an all-clear must
  // not be announced over one: "nothing is waiting" would be a claim we cannot
  // actually make.
  const unreadable = items.filter((item) => item.count === null);

  return (
    <div className="bg-card border border-border rounded-3xl shadow-soft p-6 sm:p-7 mb-10">
      {waiting.length === 0 ? (
        <div className="flex items-center gap-3">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
              unreadable.length > 0
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-500"
                : "bg-green-500/10 text-green-700 dark:text-green-500"
            }`}
          >
            {unreadable.length > 0 ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
          </span>
          <div>
            <p className="font-semibold">
              {unreadable.length > 0 ? "Vue incomplète." : "Rien ne vous attend."}
            </p>
            <p className="text-sm text-muted-foreground">
              {unreadable.length > 0
                ? "Rien à publier, mais les files de paiement sont illisibles tant que leurs migrations ne sont pas appliquées."
                : "Aucun paiement ni profil en attente de votre part."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-semibold mb-4">Ce qui vous attend</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {waiting.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${
                    item.urgent
                      ? "border-secondary/50 bg-secondary/10 hover:bg-secondary/15"
                      : "border-border bg-surface hover:bg-muted"
                  }`}
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                      item.urgent
                        ? "bg-secondary/25 text-secondary-foreground"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-2xl font-bold leading-none">
                      {item.count}
                    </span>
                    <span className="block text-sm text-muted-foreground truncate">
                      {item.count === 1 ? item.singular : item.plural}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 ml-auto shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>

          {/* Same caveat as the all-clear state: a queue we cannot read must be
              named, or its absence from the list reads as "empty". */}
          {unreadable.length > 0 && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-500">
              {unreadable.map((item) => item.label).join(" et ")}
              {" "}:{" "}
              {unreadable.length > 1
                ? "ces files restent illisibles tant que leurs migrations ne sont pas appliquées."
                : "cette file reste illisible tant que sa migration n'est pas appliquée."}
            </p>
          )}
        </>
      )}

      <Link
        href="/admin/momo"
        className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <MessageSquareText className="h-4 w-4" />
        Journal des encaissements Mobile Money
      </Link>
    </div>
  );
}
