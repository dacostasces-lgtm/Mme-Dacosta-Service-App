-- Rattrapage de deux migrations précédentes, constaté par verify_after_push.sql
-- sur la base de production.
--
-- 1. `REVOKE EXECUTE ... FROM PUBLIC` ne suffit pas ici.
--
--    Sur une instance locale neuve, une fonction n'a que le droit implicite
--    accordé à PUBLIC, et le révoquer ferme la porte — ce que les tests
--    locaux confirmaient. La base hébergée, elle, accorde EXECUTE à `anon` et
--    `authenticated` *nommément*, via les ALTER DEFAULT PRIVILEGES posés à sa
--    création. Un revoke sur PUBLIC laisse ces droits nominatifs intacts.
--
--    C'est la même divergence que celle qui avait révélé l'absence totale de
--    droits sur les tables : l'environnement local ne reproduit pas les
--    privilèges par défaut de la production. La preuve est dans le schéma
--    lui-même — 20260728020000 nomme `anon` explicitement et sa fonction est
--    bien fermée, 20260728010000 ne cite que PUBLIC et les siennes sont
--    restées ouvertes.
--
--    Aucune donnée n'a fuité : `my_contact()` filtre sur `auth.uid()`, qui est
--    NULL pour un appelant anonyme, et `admin_profile_emails()` lève une
--    exception hors administrateur. Mais la fermeture doit être une
--    permission, pas une propriété du corps de la fonction.

REVOKE ALL ON FUNCTION public.my_contact() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_contact() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_profile_emails(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_profile_emails(UUID[]) TO authenticated, service_role;

-- 2. Le correctif anti-course de 20260728040000 n'a jamais atteint la base.
--
--    Ce fichier avait déjà été appliqué lorsqu'il a été corrigé ; son
--    horodatage étant enregistré dans `supabase_migrations.schema_migrations`,
--    `db push` l'a considéré comme fait et ne l'a pas rejoué. Le corps est
--    donc réappliqué ici, sous un nouvel horodatage.
--
--    Sans cette garde, un SMS Mobile Money peut tamponner une réservation
--    qu'un administrateur vient de régler à la main depuis la file manuelle :
--    la ligne serait confirmée deux fois, pour un seul versement.

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
     WHERE id = v_booking.id
       AND status = 'pending_payment';

    IF NOT FOUND THEN
      v_outcome := 'unmatched';
      v_note    := 'La réservation a été réglée entre-temps par un autre canal.';
    ELSE
      v_outcome := 'matched';
    END IF;
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
