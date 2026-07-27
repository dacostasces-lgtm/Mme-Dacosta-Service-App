"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { BOOKING_FEE_XAF } from "@/lib/bookings/constants";

const schema = z.object({
  contractType: z.enum(["full_time", "part_time", "one_off"]),
  startDate: z.string().optional(),
  schedule: z.string().trim().max(120).optional(),
  address: z.string().trim().min(3, "Indiquez le lieu de la mission."),
  paymentMethod: z.enum(["mobile_money", "card"], {
    message: "Choisissez un moyen de paiement.",
  }),
});

export type BookingState = { error?: string; bookingId?: string };

export async function createBooking(
  candidateId: string,
  _previous: BookingState,
  formData: FormData
): Promise<BookingState> {
  const user = await requireUser({ role: "employer" });

  const parsed = schema.safeParse({
    contractType: formData.get("contractType"),
    startDate: String(formData.get("startDate") ?? "") || undefined,
    schedule: String(formData.get("schedule") ?? "") || undefined,
    address: formData.get("address"),
    paymentMethod: formData.get("paymentMethod"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  }

  if (!user.profileId) {
    return { error: "Votre profil est introuvable. Reconnectez-vous puis réessayez." };
  }

  const supabase = await createClient();

  // RLS hides candidates awaiting moderation, so this also stops a booking
  // being aimed at a profile the employer was never allowed to see.
  const { data: candidate } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", candidateId)
    .eq("role", "candidate")
    .maybeSingle();

  if (!candidate) {
    return { error: "Ce profil n'est plus disponible à la réservation." };
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      employer_id: user.profileId,
      candidate_id: candidateId,
      contract_type: parsed.data.contractType,
      start_date: parsed.data.startDate ?? null,
      schedule: parsed.data.schedule ?? null,
      address: parsed.data.address,
      amount: BOOKING_FEE_XAF,
      payment_method: parsed.data.paymentMethod,
      // status stays 'pending_payment': no provider is wired, and the database
      // trigger would refuse anything else from an employer anyway.
    })
    .select("id")
    .single();

  if (error) {
    return { error: `Enregistrement impossible : ${error.message}` };
  }

  revalidatePath("/", "layout");
  return { bookingId: data.id };
}
