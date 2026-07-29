-- The pricing page has been selling Premium since the MVP, but nothing could
-- ever buy it: `subscriptions` was given a SELECT policy and no INSERT policy,
-- on the grounds that "writes go through the service role" — and no code ever
-- did. `profiles.is_premium` could only be flipped by hand in the dashboard.
--
-- This wires the same manual Mobile Money settlement the bookings already use:
-- the subscriber declares the transaction id from their confirmation SMS, and
-- an admin matches it against the MoMo statement before anything is granted.
-- Nothing here trusts the client with the outcome.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending_payment',
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_declared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- `end_date` was NOT NULL, which forced the caller to invent an expiry before
-- the subscription had even been paid for. It is set on activation instead.
ALTER TABLE public.subscriptions ALTER COLUMN end_date DROP NOT NULL;

-- A subscription starts inactive. `is_active` used to default to TRUE, so an
-- unpaid row would have counted as a live subscription the moment it existed.
ALTER TABLE public.subscriptions ALTER COLUMN is_active SET DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_status_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_status_check
      CHECK (status IN ('pending_payment', 'active', 'rejected', 'cancelled'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_pending
  ON public.subscriptions (created_at)
  WHERE status = 'pending_payment';

-- Policies ---------------------------------------------------------------------
-- SELECT already exists from 20260727000000_rls_policies.sql.

DROP POLICY IF EXISTS "Users can request their own subscription." ON public.subscriptions;
CREATE POLICY "Users can request their own subscription."
  ON public.subscriptions FOR INSERT
  WITH CHECK (
    profile_id = public.current_profile_id()
    AND status = 'pending_payment'
    AND is_active = FALSE
  );

DROP POLICY IF EXISTS "Users can update their own subscription." ON public.subscriptions;
CREATE POLICY "Users can update their own subscription."
  ON public.subscriptions FOR UPDATE
  USING (profile_id = public.current_profile_id() OR public.is_admin());

-- The UPDATE policy above decides *which row*; this decides *which columns*,
-- exactly as protect_booking_payment_columns does for bookings. Without it a
-- subscriber could set their own row to `active`, and the SELECT policy would
-- happily report it back.
CREATE OR REPLACE FUNCTION public.protect_subscription_columns()
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

  NEW.profile_id           := OLD.profile_id;
  NEW.plan_name            := OLD.plan_name;
  NEW.price                := OLD.price;
  NEW.currency             := OLD.currency;
  NEW.is_active            := OLD.is_active;
  NEW.start_date           := OLD.start_date;
  NEW.end_date             := OLD.end_date;
  NEW.payment_reference    := OLD.payment_reference;
  NEW.payment_declared_at  := OLD.payment_declared_at;
  NEW.payment_confirmed_at := OLD.payment_confirmed_at;
  NEW.payment_confirmed_by := OLD.payment_confirmed_by;

  -- The one transition a subscriber may make is withdrawing their own request.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_subscription_columns ON public.subscriptions;
CREATE TRIGGER protect_subscription_columns
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_columns();

-- Declaring a payment -----------------------------------------------------------
-- SECURITY DEFINER so the trigger above steps aside — which makes the checks in
-- here the only guard, hence the explicit ownership and state tests.
CREATE OR REPLACE FUNCTION public.declare_subscription_payment(
  p_subscription_id UUID,
  p_reference       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile UUID := public.current_profile_id();
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.subscriptions
     SET payment_reference   = p_reference,
         payment_declared_at = NOW()
   WHERE id = p_subscription_id
     AND profile_id = v_profile
     AND status = 'pending_payment';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abonnement introuvable ou déjà réglé.' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- `anon` est nommé explicitement : la base hébergée lui accorde EXECUTE
-- nominativement via ses ALTER DEFAULT PRIVILEGES, et un revoke limité à
-- PUBLIC laisserait ce droit en place (voir 20260728060000).
REVOKE ALL ON FUNCTION public.declare_subscription_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_subscription_payment(UUID, TEXT)
  TO authenticated, service_role;

-- Settlement --------------------------------------------------------------------
-- Granting Premium is one act: the subscription becomes active *and*
-- `profiles.is_premium` flips. Splitting that across two statements in the
-- application would eventually leave a paid subscription with no badge, or a
-- badge with no subscription behind it.
CREATE OR REPLACE FUNCTION public.settle_subscription(
  p_subscription_id UUID,
  p_confirmed       BOOLEAN,
  p_months          INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID;
  v_sub   public.subscriptions%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE user_id = auth.uid();

  SELECT * INTO v_sub FROM public.subscriptions
   WHERE id = p_subscription_id AND status = 'pending_payment';

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Abonnement introuvable ou déjà traité.';
  END IF;

  IF p_confirmed THEN
    UPDATE public.subscriptions
       SET status               = 'active',
           is_active            = TRUE,
           start_date           = NOW(),
           end_date             = NOW() + (GREATEST(p_months, 1) || ' months')::INTERVAL,
           payment_confirmed_at = NOW(),
           payment_confirmed_by = v_admin
     WHERE id = p_subscription_id;

    UPDATE public.profiles SET is_premium = TRUE WHERE id = v_sub.profile_id;
  ELSE
    -- Cleared rather than left in place, so the subscriber can submit a
    -- corrected reference instead of being stuck with a rejected one.
    UPDATE public.subscriptions
       SET status              = 'rejected',
           payment_reference   = NULL,
           payment_declared_at = NULL
     WHERE id = p_subscription_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_subscription(UUID, BOOLEAN, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_subscription(UUID, BOOLEAN, INT)
  TO authenticated, service_role;

-- Expiry -------------------------------------------------------------------------
-- Nothing revokes Premium when a subscription lapses. Called from a scheduled
-- job (pg_cron, or the admin screen) rather than trusted to run itself.
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    UPDATE public.subscriptions
       SET is_active = FALSE, status = 'cancelled'
     WHERE is_active AND end_date IS NOT NULL AND end_date < NOW()
    RETURNING profile_id
  )
  UPDATE public.profiles p
     SET is_premium = FALSE
   WHERE p.id IN (SELECT profile_id FROM expired)
     -- Not if another subscription is still running for the same profile.
     AND NOT EXISTS (
       SELECT 1 FROM public.subscriptions s
        WHERE s.profile_id = p.id AND s.is_active
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_subscriptions() TO service_role;
