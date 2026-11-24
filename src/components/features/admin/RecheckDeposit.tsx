"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { recheckPawapayDeposit } from "@/lib/admin/actions";

/**
 * Redemande à PawaPay l'état d'un paiement resté « en cours » — quand
 * l'acheteur a fermé la page avant la fin et que le rappel de PawaPay ne nous
 * est pas parvenu. S'il a abouti, l'achat se règle du même coup.
 */
export function RecheckDepositButton({ depositId }: { depositId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full gap-1.5"
        disabled={pending}
        onClick={() => {
          setError("");
          startTransition(async () => {
            const result = await recheckPawapayDeposit(depositId);
            if (result.error) setError(result.error);
            router.refresh();
          });
        }}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Vérifier auprès de PawaPay
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
