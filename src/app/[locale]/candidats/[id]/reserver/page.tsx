import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/features/booking/BookingFlow";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

// Booking is an employer action, so the guard runs on the server before any of
// the (client-side) booking UI is sent to the browser.
export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser({ role: "employer" });
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_candidate", { candidate_id: id });
  const candidate = data?.[0] as { id: string; full_name: string } | undefined;

  // Same rule as the public profile: a candidate awaiting moderation is not
  // reachable, so they cannot be booked either.
  if (!candidate) notFound();

  return <BookingFlow candidateId={candidate.id} candidateName={candidate.full_name} />;
}
