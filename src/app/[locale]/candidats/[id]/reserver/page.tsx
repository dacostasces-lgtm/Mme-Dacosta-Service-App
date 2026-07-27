import { BookingFlow } from "@/components/features/booking/BookingFlow";
import { requireUser } from "@/lib/auth/dal";

// Booking is an employer action, so the guard runs on the server before any of
// the (client-side) booking UI is sent to the browser.
export default async function BookingPage() {
  await requireUser({ role: "employer" });

  return <BookingFlow />;
}
