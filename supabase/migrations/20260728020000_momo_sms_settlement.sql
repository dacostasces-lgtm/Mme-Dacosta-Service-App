-- Automatic settlement from the merchant SIM's confirmation SMS.
--
-- A relay app on the phone holding the merchant SIM forwards every incoming
-- Mobile Money SMS to /api/momo/sms. The server parses it and, when the
-- reference and the amount match a booking exactly, marks it paid. Anything
-- ambiguous is logged and left to the manual queue rather than guessed.

CREATE TABLE IF NOT EXISTS public.momo_sms_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sender TEXT,
  -- Kept verbatim: when an operator changes its SMS wording the parser starts
  -- missing payments, and the raw text is the only way to see why and retune.
  body TEXT NOT NULL,
  -- sha256 of sender+body. The relay may resend on a flaky connection, and a
  -- replayed SMS must never settle a second booking.
  sms_hash TEXT NOT NULL UNIQUE,
  parsed_amount INT,
  parsed_reference TEXT,
  parsed_transaction_id TEXT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  -- matched | unmatched | duplicate | amount_mismatch
  outcome TEXT NOT NULL,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_momo_sms_events_outcome
  ON public.momo_sms_events (outcome, received_at DESC);

ALTER TABLE public.momo_sms_events ENABLE ROW LEVEL SECURITY;

-- Admins read it to investigate a payment a customer says they made. Nobody
-- writes it through the API: inserts happen inside the RPC below, which only
-- service_role may execute.
CREATE POLICY "Admins read the Mobile Money SMS log."
  ON public.momo_sms_events FOR SELECT
  USING (public.is_admin());

/**
 * Records one inbound SMS and settles the matching booking.
 *
 * Matching is deliberately strict: the reference derived from the booking id
 * must appear in the SMS *and* the amount must be exactly what is owed. A near
 * miss is logged as `amount_mismatch` and left for a human — auto-approving a
 * short payment would give away the introduction for less than the fee.
 *
 * SECURITY DEFINER and granted to service_role only. It must never be reachable
 * with the anon key: that key ships to the browser, and execute rights on this
 * would let anyone mark their own booking paid.
 */
CREATE OR REPLACE FUNCTION public.settle_booking_from_sms(
  p_sender         TEXT,
  p_body           TEXT,
  p_sms_hash       TEXT,
  p_amount         INT,
  p_reference      TEXT,
  p_transaction_id TEXT
)
RETURNS TABLE (outcome TEXT, booking_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking  public.bookings%ROWTYPE;
  v_outcome  TEXT;
  v_note     TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.momo_sms_events WHERE sms_hash = p_sms_hash) THEN
    RETURN QUERY SELECT 'duplicate'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF p_reference IS NOT NULL AND p_amount IS NOT NULL THEN
    SELECT * INTO v_booking
      FROM public.bookings b
     WHERE b.status = 'pending_payment'
       AND 'MD-' || UPPER(SUBSTRING(REPLACE(b.id::TEXT, '-', '') FROM 1 FOR 6))
           = UPPER(p_reference)
     ORDER BY b.created_at
     LIMIT 1;
  END IF;

  IF v_booking.id IS NULL THEN
    v_outcome := 'unmatched';
    v_note    := 'Aucune réservation impayée ne porte cette référence.';
  ELSIF v_booking.amount IS DISTINCT FROM p_amount THEN
    v_outcome := 'amount_mismatch';
    v_note    := FORMAT('Montant reçu %s, attendu %s.', p_amount, v_booking.amount);
  ELSE
    UPDATE public.bookings
       SET status               = 'paid',
           payment_method       = COALESCE(payment_method, 'mobile_money'),
           payment_reference    = COALESCE(p_transaction_id, payment_reference),
           payment_declared_at  = COALESCE(payment_declared_at, NOW()),
           payment_confirmed_at = NOW(),
           updated_at           = NOW()
     WHERE id = v_booking.id;

    v_outcome := 'matched';
  END IF;

  INSERT INTO public.momo_sms_events (
    sender, body, sms_hash, parsed_amount, parsed_reference,
    parsed_transaction_id, booking_id, outcome, note
  )
  VALUES (
    p_sender, p_body, p_sms_hash, p_amount, p_reference,
    p_transaction_id,
    CASE WHEN v_outcome = 'matched' THEN v_booking.id ELSE NULL END,
    v_outcome, v_note
  );

  RETURN QUERY SELECT v_outcome, CASE WHEN v_outcome = 'matched' THEN v_booking.id END;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_booking_from_sms(TEXT, TEXT, TEXT, INT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_booking_from_sms(TEXT, TEXT, TEXT, INT, TEXT, TEXT)
  TO service_role;
