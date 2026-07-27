-- Booking requests. The funnel existed as a mock that announced "Réservation
-- confirmée !" without recording anything and without taking a payment; this
-- gives it a real table, and lets the UI stop claiming a payment happened.
--
-- No payment provider is wired yet, so every booking starts — and stays — in
-- `pending_payment` until a Mobile Money callback moves it on.

CREATE TYPE public.booking_status AS ENUM (
  'pending_payment', 'paid', 'cancelled', 'completed'
);

CREATE TYPE public.contract_type AS ENUM ('full_time', 'part_time', 'one_off');

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contract_type public.contract_type NOT NULL DEFAULT 'full_time',
  start_date DATE,
  schedule TEXT,
  address TEXT,
  -- Priced server-side. The amount must never come from the browser.
  amount INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XAF',
  payment_method TEXT,
  payment_reference TEXT,
  status public.booking_status NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_employer ON public.bookings(employer_id);
CREATE INDEX idx_bookings_candidate ON public.bookings(candidate_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Both sides of the booking can see it; nobody else can.
CREATE POLICY "Bookings are visible to both parties."
  ON public.bookings FOR SELECT
  USING (
    employer_id = public.current_profile_id()
    OR candidate_id = public.current_profile_id()
    OR public.is_admin()
  );

CREATE POLICY "Employers can request a booking."
  ON public.bookings FOR INSERT
  WITH CHECK (
    employer_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = employer_id AND p.role = 'employer'
    )
  );

CREATE POLICY "Employers can amend their own booking."
  ON public.bookings FOR UPDATE
  USING (employer_id = public.current_profile_id() OR public.is_admin());

-- `status`, `amount` and the payment fields decide whether money is owed, so an
-- employer must not be able to set them by hand — otherwise anyone could mark
-- their own booking 'paid' and skip the fee entirely. Same pattern as
-- protect_profile_columns: SECURITY INVOKER, so `current_user` is the caller.
CREATE OR REPLACE FUNCTION public.protect_booking_payment_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.amount            := OLD.amount;
  NEW.currency          := OLD.currency;
  NEW.payment_reference := OLD.payment_reference;

  -- The one transition an employer may make is cancelling their own request.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    NEW.status := OLD.status;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_booking_payment_columns ON public.bookings;
CREATE TRIGGER protect_booking_payment_columns
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.protect_booking_payment_columns();
