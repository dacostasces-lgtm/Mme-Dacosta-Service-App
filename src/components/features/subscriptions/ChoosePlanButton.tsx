"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startSubscription, type SubscriptionState } from "@/lib/subscriptions/actions";
import type { PlanId } from "@/lib/subscriptions/plans";

/**
 * Posts the plan *id* only. The price is resolved server-side from plans.ts —
 * a form that carries the amount is a form the buyer can edit.
 */
export function ChoosePlanButton({
  planId,
  highlighted,
}: {
  planId: PlanId;
  highlighted?: boolean;
}) {
  const [state, formAction, pending] = useActionState<SubscriptionState, FormData>(
    startSubscription,
    {}
  );

  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="plan" value={planId} />
      <Button
        type="submit"
        variant={highlighted ? "default" : "outline"}
        disabled={pending}
        className={cn(
          "w-full h-11 rounded-full",
          !highlighted &&
            "border-2 border-primary/30 text-primary hover:bg-accent hover:text-primary"
        )}
      >
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {pending ? "Un instant..." : "Choisir cette offre"}
      </Button>
      {state.error && (
        <p className="text-xs text-destructive mt-2 text-center">{state.error}</p>
      )}
    </form>
  );
}
