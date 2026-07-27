"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMessage, type MessageState } from "@/lib/messages/actions";

export function MessageComposer({ receiverId }: { receiverId: string }) {
  const action = sendMessage.bind(null, receiverId);
  const [state, formAction, pending] = useActionState<MessageState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the box once the server confirms the send, not optimistically.
  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <div className="p-4 border-t border-border bg-card">
      {state.error && <p className="text-xs text-destructive mb-2">{state.error}</p>}
      <form ref={formRef} action={formAction} className="flex items-center gap-3">
        <Input
          name="content"
          placeholder="Écrivez votre message..."
          autoComplete="off"
          className="flex-1 h-11"
          disabled={pending}
        />
        <Button type="submit" size="icon" className="h-11 w-11 rounded-full shrink-0" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="sr-only">Envoyer</span>
        </Button>
      </form>
    </div>
  );
}
