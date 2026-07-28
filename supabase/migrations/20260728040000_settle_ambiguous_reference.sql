-- Guards settlement against reference collisions.
--
-- A booking reference is `MD-` + the first 6 hex characters of its id: about
-- 16.7 million values. Two *pending* bookings sharing one is unlikely per
-- payment, but the previous matching took `ORDER BY created_at LIMIT 1` and
-- settled the oldest without ever noticing the other. The amount check could
-- not save it either — every booking costs the same fee, so both candidates
-- match the amount exactly.
--
-- The failure is silent and lands on the wrong person: the employer who paid
-- stays marked unpaid, while a stranger's booking is settled for free. Since
-- the SMS itself carries nothing else to disambiguate with, the honest outcome
-- is to settle neither and put it in front of a human.

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
  v_matches  INT := 0;
  v_outcome  TEXT;
  v_note     TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.momo_sms_events WHERE sms_hash = p_sms_hash) THEN
    RETURN QUERY SELECT 'duplicate'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF p_reference IS NOT NULL AND p_amount IS NOT NULL THEN
    SELECT COUNT(*) INTO v_matches
      FROM public.bookings b
     WHERE b.status = 'pending_payment'
       AND 'MD-' || UPPER(SUBSTRING(REPLACE(b.id::TEXT, '-', '') FROM 1 FOR 6))
           = UPPER(p_reference);

    IF v_matches = 1 THEN
      SELECT * INTO v_booking
        FROM public.bookings b
       WHERE b.status = 'pending_payment'
         AND 'MD-' || UPPER(SUBSTRING(REPLACE(b.id::TEXT, '-', '') FROM 1 FOR 6))
             = UPPER(p_reference);
    END IF;
  END IF;

  IF v_matches > 1 THEN
    v_outcome := 'ambiguous';
    v_note    := FORMAT(
      '%s réservations impayées portent la référence %s. Rapprochement manuel requis.',
      v_matches, p_reference
    );
  ELSIF v_booking.id IS NULL THEN
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

-- Collisions get rarer the fewer bookings sit unpaid at once, so this index also
-- keeps the lookup above cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_bookings_pending
  ON public.bookings (created_at)
  WHERE status = 'pending_payment';
