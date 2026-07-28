-- Manual Mobile Money settlement.
--
-- No provider API is connected: the employer pays the platform's MoMo number
-- from their phone, quotes a reference, then declares the transaction id here.
-- An admin checks it against the MoMo statement and confirms.
--
-- Deliberately no new `booking_status` value: `ALTER TYPE ... ADD VALUE` cannot
-- be used in the same transaction that adds it, which is exactly how Supabase
-- runs a migration file. "Awaiting confirmation" is therefore expressed as
-- `status = 'pending_payment' AND payment_declared_at IS NOT NULL`.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_declared_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID REFERENCES public.profiles(id);

-- Feeds the moderation queue: the bookings an admin still has to check.
CREATE INDEX IF NOT EXISTS idx_bookings_awaiting_confirmation
  ON public.bookings (payment_declared_at)
  WHERE status = 'pending_payment' AND payment_declared_at IS NOT NULL;

-- The employer must not be able to stamp these by hand any more than they can
-- set `amount` or `status`; only the RPC below and an admin may write them.
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

  NEW.amount               := OLD.amount;
  NEW.currency             := OLD.currency;
  NEW.payment_reference    := OLD.payment_reference;
  NEW.payment_declared_at  := OLD.payment_declared_at;
  NEW.payment_confirmed_at := OLD.payment_confirmed_at;
  NEW.payment_confirmed_by := OLD.payment_confirmed_by;

  -- The one transition an employer may make is cancelling their own request.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    NEW.status := OLD.status;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Lets the paying employer attach their MoMo transaction id.
--
-- SECURITY DEFINER, so `current_user` inside the trigger is the function owner
-- and the guard above steps aside. That makes the checks in here the only thing
-- standing between an employer and the payment columns — hence the explicit
-- ownership and state tests rather than relying on RLS alone.
CREATE OR REPLACE FUNCTION public.declare_booking_payment(
  p_booking_id UUID,
  p_reference  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  v_reference  TEXT := NULLIF(BTRIM(p_reference), '');
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.';
  END IF;

  IF v_reference IS NULL OR LENGTH(v_reference) > 64 THEN
    RAISE EXCEPTION 'Référence de transaction invalide.';
  END IF;

  UPDATE public.bookings
     SET payment_reference   = v_reference,
         payment_declared_at = NOW(),
         updated_at          = NOW()
   WHERE id = p_booking_id
     AND employer_id = v_profile_id
     -- Only from the unpaid state, and only once: re-declaring would let an
     -- employer overwrite a reference an admin is in the middle of checking.
     AND status = 'pending_payment'
     AND payment_declared_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Réservation introuvable, déjà réglée ou déjà déclarée.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.declare_booking_payment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.declare_booking_payment(UUID, TEXT) TO authenticated;
