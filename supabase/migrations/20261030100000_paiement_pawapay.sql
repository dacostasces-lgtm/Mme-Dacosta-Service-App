-- Encaisser par PawaPay, et régler sans intervention humaine.
--
-- Jusqu'ici l'argent arrivait par un virement Mobile Money que l'acheteur
-- faisait lui-même vers le numéro de la plateforme, en citant une référence,
-- puis déclarait. Quelqu'un rapprochait ensuite ce versement du relevé, à la
-- main, dans l'une des quatre files. Le seul règlement automatique existant —
-- settle_booking_from_sms — ne couvre que les réservations, qu'on ne peut plus
-- créer depuis que « Réserver » a été retiré : l'automatisation visait la seule
-- chose que personne n'achète.
--
-- Avec PawaPay, l'acheteur ne transfère plus rien lui-même : il saisit son
-- numéro, reçoit une demande d'autorisation sur son téléphone, tape son code,
-- et PawaPay nous dit si l'argent est arrivé. Ce fichier tient le lien entre un
-- versement PawaPay et ce qu'il paie, et règle l'achat quand il aboutit.
--
-- Deux principes qui tiennent tout :
--
--   1. Le montant ne vient jamais du navigateur. `start_pawapay_deposit` le lit
--      sur la ligne achetée, comme request_* le posait. Un acheteur qui
--      trafique sa requête ne peut pas se faire un Premium à 100 FCFA.
--   2. Le contenu d'un rappel n'est jamais cru. PawaPay signe ses rappels en
--      RFC 9421, mais la signature se désactive depuis leur tableau de bord et
--      sa vérification est délicate ; surtout, l'adresse de rappel est
--      publique. Le serveur ne retient donc du rappel que l'identifiant du
--      versement, puis redemande son état à PawaPay avec notre jeton. Un faux
--      rappel ne déclenche au pire qu'une vérification qui dit la vérité.

-- 1. Ce qu'un versement paie ----------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.pawapay_purpose AS ENUM (
    'contact_unlock',    -- une candidate paie le numéro d'un employeur
    'candidate_unlock',  -- un employeur paie le numéro d'une candidate
    'job_payment',       -- un employeur paie la publication d'une offre
    'subscription'       -- un abonnement Premium
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.pawapay_deposits (
  -- L'identifiant que nous engendrons et passons à PawaPay. Clé primaire :
  -- c'est lui qui revient dans le rappel, et lui qui rend l'opération rejouable
  -- sans risque.
  deposit_id              UUID PRIMARY KEY,
  purpose                 public.pawapay_purpose NOT NULL,
  -- La ligne payée : contact_unlocks.id, candidate_unlocks.id,
  -- job_payments.id ou subscriptions.id selon `purpose`. Pas de clé étrangère,
  -- faute de pouvoir en poser une vers quatre tables ; l'intégrité est tenue
  -- par les fonctions ci-dessous, seules à écrire ici.
  target_id               UUID NOT NULL,
  profile_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount                  INT NOT NULL CHECK (amount > 0),
  currency                TEXT NOT NULL DEFAULT 'XAF',
  phone                   TEXT,
  provider                TEXT,
  -- Les états de PawaPay, repris tels quels pour que le journal se lise contre
  -- leur tableau de bord sans traduction : ACCEPTED, PROCESSING,
  -- IN_RECONCILIATION, COMPLETED, FAILED, et REJECTED au refus d'initiation.
  status                  TEXT NOT NULL DEFAULT 'ACCEPTED',
  failure_code            TEXT,
  provider_transaction_id TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pawapay_deposits_cible ON public.pawapay_deposits (purpose, target_id);
CREATE INDEX IF NOT EXISTS pawapay_deposits_profil ON public.pawapay_deposits (profile_id, created_at DESC);

-- Un seul versement en vol par achat. Sans cela, toucher deux fois « Payer »
-- lance deux demandes d'autorisation sur le téléphone, et la personne paie
-- deux fois le même déblocage.
CREATE UNIQUE INDEX IF NOT EXISTS pawapay_deposits_un_seul_en_vol
  ON public.pawapay_deposits (purpose, target_id)
  WHERE status IN ('ACCEPTED', 'PROCESSING', 'IN_RECONCILIATION');

ALTER TABLE public.pawapay_deposits ENABLE ROW LEVEL SECURITY;

-- Lecture par celui qui paie, et par l'administration. Aucune écriture directe :
-- les deux fonctions ci-dessous sont les seules portes.
DROP POLICY IF EXISTS "Chacun suit ses propres versements." ON public.pawapay_deposits;
CREATE POLICY "Chacun suit ses propres versements."
  ON public.pawapay_deposits FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id() OR public.is_admin());

REVOKE ALL ON public.pawapay_deposits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pawapay_deposits TO authenticated;

-- 2. Ouvrir un versement --------------------------------------------------------

/**
 * Enregistre un versement à venir, et rend le montant à demander.
 *
 * Le montant est lu sur la ligne achetée, jamais reçu de l'appelant : c'est la
 * même règle que request_* posait, et c'est elle qui empêche un acheteur de se
 * faire un Premium Employeur à 100 FCFA en trafiquant sa requête.
 *
 * Vérifie aussi que l'achat appartient bien à celui qui paie. Sans cela,
 * connaître l'identifiant d'un déblocage suffirait à le faire régler par
 * quelqu'un d'autre — sans gain pour l'attaquant, mais la table dirait faux.
 */
CREATE OR REPLACE FUNCTION public.start_pawapay_deposit(
  p_purpose    public.pawapay_purpose,
  p_target_id  UUID,
  p_deposit_id UUID,
  p_phone      TEXT,
  p_provider   TEXT
)
RETURNS TABLE (amount INT, currency TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me       UUID := public.current_profile_id();
  v_amount   INT;
  v_currency TEXT;
  v_owner    UUID;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = '42501';
  END IF;

  IF p_purpose = 'contact_unlock' THEN
    SELECT c.price, c.currency, c.candidate_id INTO v_amount, v_currency, v_owner
      FROM public.contact_unlocks c
     WHERE c.id = p_target_id AND c.status = 'pending_payment';
  ELSIF p_purpose = 'candidate_unlock' THEN
    SELECT u.price, u.currency, u.employer_id INTO v_amount, v_currency, v_owner
      FROM public.candidate_unlocks u
     WHERE u.id = p_target_id AND u.status = 'pending_payment';
  ELSIF p_purpose = 'job_payment' THEN
    SELECT j.price, j.currency, j.employer_id INTO v_amount, v_currency, v_owner
      FROM public.job_payments j
     WHERE j.id = p_target_id AND j.status = 'pending_payment';
  ELSIF p_purpose = 'subscription' THEN
    SELECT s.price, s.currency, s.profile_id INTO v_amount, v_currency, v_owner
      FROM public.subscriptions s
     WHERE s.id = p_target_id AND s.status = 'pending_payment';
  END IF;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Achat introuvable ou déjà réglé.' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner IS DISTINCT FROM v_me AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Cet achat n''est pas le vôtre.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pawapay_deposits (
    deposit_id, purpose, target_id, profile_id, amount, currency, phone, provider
  ) VALUES (
    p_deposit_id, p_purpose, p_target_id, v_me, v_amount,
    COALESCE(v_currency, 'XAF'), p_phone, p_provider
  );

  RETURN QUERY SELECT v_amount, COALESCE(v_currency, 'XAF');
END;
$$;

REVOKE ALL ON FUNCTION public.start_pawapay_deposit(public.pawapay_purpose, UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_pawapay_deposit(public.pawapay_purpose, UUID, UUID, TEXT, TEXT)
  TO authenticated, service_role;

-- 3. Régler quand l'argent est arrivé -------------------------------------------

/**
 * Porte l'état rendu par PawaPay, et règle l'achat si le versement a abouti.
 *
 * Appelée par le serveur seul, après avoir redemandé l'état à PawaPay : le
 * contenu d'un rappel n'est jamais cru, seul son identifiant l'est.
 *
 * Rejouable sans dommage. Les rappels se répètent, la page de l'acheteur
 * interroge aussi de son côté, et les deux peuvent arriver ensemble : le
 * passage à un état final ne se fait qu'une fois, et les règlements portent
 * tous `status = 'pending_payment'` dans leur WHERE.
 *
 * Elle ne passe pas par settle_contact_unlock() et consorts : celles-ci
 * exigent d'être administrateur, ce que le serveur n'est pas. L'autorité ici
 * n'est pas un rôle, c'est l'arrivée de l'argent.
 */
CREATE OR REPLACE FUNCTION public.settle_pawapay_deposit(
  p_deposit_id   UUID,
  p_status       TEXT,
  p_provider_tx  TEXT DEFAULT NULL,
  p_failure_code TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dep    public.pawapay_deposits%ROWTYPE;
  v_mois   INT := 1;
BEGIN
  SELECT * INTO v_dep FROM public.pawapay_deposits WHERE deposit_id = p_deposit_id;
  IF v_dep.deposit_id IS NULL THEN
    RETURN 'unknown';
  END IF;

  -- Déjà conclu : on ne rejoue rien, et surtout on ne réactive pas un achat
  -- qu'une administration aurait retiré depuis.
  IF v_dep.status IN ('COMPLETED', 'FAILED', 'REJECTED') THEN
    RETURN v_dep.status;
  END IF;

  UPDATE public.pawapay_deposits
     SET status                  = p_status,
         provider_transaction_id = COALESCE(p_provider_tx, provider_transaction_id),
         failure_code            = p_failure_code,
         updated_at              = NOW(),
         settled_at              = CASE WHEN p_status = 'COMPLETED' THEN NOW() ELSE settled_at END
   WHERE deposit_id = p_deposit_id;

  IF p_status <> 'COMPLETED' THEN
    RETURN p_status;
  END IF;

  IF v_dep.purpose = 'contact_unlock' THEN
    UPDATE public.contact_unlocks
       SET status = 'active', payment_declared_at = COALESCE(payment_declared_at, NOW()),
           payment_confirmed_at = NOW(), payment_reference = COALESCE(p_provider_tx, payment_reference)
     WHERE id = v_dep.target_id AND status = 'pending_payment';

  ELSIF v_dep.purpose = 'candidate_unlock' THEN
    UPDATE public.candidate_unlocks
       SET status = 'active', payment_declared_at = COALESCE(payment_declared_at, NOW()),
           payment_confirmed_at = NOW(), payment_reference = COALESCE(p_provider_tx, payment_reference)
     WHERE id = v_dep.target_id AND status = 'pending_payment';

  ELSIF v_dep.purpose = 'job_payment' THEN
    UPDATE public.job_payments
       SET status = 'active', payment_declared_at = COALESCE(payment_declared_at, NOW()),
           payment_confirmed_at = NOW(), payment_reference = COALESCE(p_provider_tx, payment_reference)
     WHERE id = v_dep.target_id AND status = 'pending_payment';

  ELSIF v_dep.purpose = 'subscription' THEN
    UPDATE public.subscriptions
       SET status = 'active', is_active = TRUE,
           start_date = NOW(), end_date = NOW() + (v_mois || ' months')::INTERVAL,
           payment_declared_at = COALESCE(payment_declared_at, NOW()),
           payment_confirmed_at = NOW(), payment_reference = COALESCE(p_provider_tx, payment_reference)
     WHERE id = v_dep.target_id AND status = 'pending_payment';

    UPDATE public.profiles SET is_premium = TRUE
     WHERE id = (SELECT profile_id FROM public.subscriptions WHERE id = v_dep.target_id);
  END IF;

  RETURN 'COMPLETED';
END;
$$;

-- Le serveur seul : la fonction règle de l'argent sans contrôler de rôle, donc
-- elle ne doit être atteignable ni par `anon` ni par un compte ordinaire.
REVOKE ALL ON FUNCTION public.settle_pawapay_deposit(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_pawapay_deposit(UUID, TEXT, TEXT, TEXT) TO service_role;
