"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequestsMessage } from "@/lib/rate-limit";

export type MessageState = { error?: string };

export async function sendMessage(
  receiverId: string,
  _previous: MessageState,
  formData: FormData
): Promise<MessageState> {
  const user = await requireUser();

  // Nothing else stands between a signed-in account and the messages table:
  // the INSERT policy only checks that the sender is who they claim to be, so
  // one script could flood every candidate on the platform.
  const limit = rateLimit(`message:${user.id}`, { limit: 20, windowSeconds: 60 });
  if (!limit.ok) {
    return { error: tooManyRequestsMessage(limit.retryAfterSeconds) };
  }

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "Écrivez un message avant d'envoyer." };
  if (content.length > 2000) return { error: "Message trop long (2000 caractères maximum)." };

  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    sender_id: user.profileId,
    receiver_id: receiverId,
    content,
  });

  if (error) {
    return { error: `Envoi impossible : ${error.message}` };
  }

  revalidatePath("/", "layout");
  return {};
}
