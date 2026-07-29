/**
 * The paid plans, and the single source of what each one costs.
 *
 * Prices are read from here server-side when a subscription is created — never
 * from the form. A price posted by the browser is a price the buyer chooses.
 */
export type PlanId = "premium_candidate" | "premium_employer";

export type Plan = {
  id: PlanId;
  /** Stored verbatim in `subscriptions.plan_name`. */
  name: string;
  price: number;
  /** Who the plan is meant for; the server refuses a mismatched role. */
  role: "candidate" | "employer";
};

export const PLANS: Record<PlanId, Plan> = {
  premium_candidate: {
    id: "premium_candidate",
    name: "Premium Candidat",
    price: 5000,
    role: "candidate",
  },
  premium_employer: {
    id: "premium_employer",
    name: "Premium Employeur",
    price: 25000,
    role: "employer",
  },
};

export function planFor(id: string): Plan | null {
  return PLANS[id as PlanId] ?? null;
}

export function formatPrice(price: number) {
  if (price === 0) return "Gratuit";
  return `${new Intl.NumberFormat("fr-FR").format(price)} FCFA`;
}
