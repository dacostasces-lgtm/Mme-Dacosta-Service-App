-- Le numéro d'un candidat, sur sa fiche.
--
-- Le pendant, côté employeur, de 20261011040000_employer_contact.sql. Le
-- bouton « Contacter » de la fiche menait à une messagerie vide : à sa place,
-- le numéro s'affiche pour qui y a droit, et sinon le paiement qui l'ouvre.
--
-- Un employeur voit le numéro d'un candidat :
--   * si ce candidat a postulé à l'une de ses offres payées (la règle de
--     20261011060000_paid_job_offers.sql, inchangée) ;
--   * s'il a un abonnement Premium Employeur en cours ;
--   * s'il a débloqué ce numéro (500 FCFA, une seule fois).
-- L'administration le voit toujours, le candidat voit le sien.
--
-- Le numéro ne sort que par candidate_contact() ci-dessous, qui décide seule
-- qui y a droit : la page ne reçoit jamais un numéro qu'elle devrait cacher.

CREATE TABLE IF NOT EXISTS public.candidate_unlocks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price                INT NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'XAF',
  status               TEXT NOT NULL DEFAULT 'pending_payment'
                       CHECK (status IN ('pending_payment', 'active', 'rejected')),
  payment_reference    TEXT,
  payment_declared_at  TIMESTAMPTZ,
  payment_confirmed_at TIMESTAMPTZ,
  payment_confirmed_by UUID REFERENCES public.profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un seul déblocage par employeur et par candidat : le numéro, une fois
  -- payé, reste acquis.
  UNIQUE (employer_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_unlocks_declared
  ON public.candidate_unlocks (payment_declared_at)
  WHERE status = 'pending_payment' AND payment_declared_at IS NOT NULL;

ALTER TABLE public.candidate_unlocks ENABLE ROW LEVEL SECURITY;

-- Lecture seule pour l'API : toute écriture passe par les fonctions ci-dessous,
-- qui fixent le prix et l'état.
DROP POLICY IF EXISTS "Candidate unlocks visible to their buyer and admins." ON public.candidate_unlocks;
CREATE POLICY "Candidate unlocks visible to their buyer and admins."
  ON public.candidate_unlocks FOR SELECT
  USING (employer_id = public.current_profile_id() OR public.is_admin());

-- La base hébergée accorde tout par défaut sur une nouvelle table (voir
-- 20261011040000) : la lecture pour l'acheteur, rien d'autre, rien pour un
-- visiteur.
REVOKE ALL ON public.candidate_unlocks FROM anon, authenticated;
GRANT SELECT ON public.candidate_unlocks TO authenticated;

-- Le numéro d'un candidat, et ce que l'appelant peut en voir -----------------
--
-- `access` dit pourquoi le numéro est montré, ou ce qui manque :
--   self / admin / unlocked / applied / premium  → numéro renvoyé
--   pending   → déblocage demandé, paiement pas encore déclaré
--   declared  → paiement déclaré, en attente de validation
--   none      → rien
-- `has_number` est renvoyé à tous, pour ne jamais faire payer un numéro qui
-- n'existe pas.
CREATE OR REPLACE FUNCTION public.candidate_contact(p_candidate_id UUID)
RETURNS TABLE (
  has_number     BOOLEAN,
  access         TEXT,
  unlock_id      UUID,
  phone          TEXT,
  whatsapp       TEXT,
  phone_verified BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := public.current_profile_id();
  v_role      public.user_role;
  v_candidate public.profiles%ROWTYPE;
  v_unlock    public.candidate_unlocks%ROWTYPE;
  v_access    TEXT := 'none';
BEGIN
  SELECT * INTO v_candidate FROM public.profiles
   WHERE id = p_candidate_id AND role = 'candidate';
  IF v_candidate.id IS NULL THEN
    RETURN;
  END IF;

  -- Même règle que get_candidate() : un profil pas encore publié n'existe que
  -- pour son titulaire et l'administration. IS DISTINCT FROM, et non <> : pour
  -- un visiteur, v_me est NULL, et la comparaison ne doit pas le laisser passer.
  IF NOT v_candidate.is_validated
     AND v_candidate.id IS DISTINCT FROM v_me
     AND NOT public.is_admin() THEN
    RETURN;
  END IF;

  IF v_me IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_me;
    SELECT * INTO v_unlock FROM public.candidate_unlocks
     WHERE employer_id = v_me AND candidate_id = p_candidate_id;

    IF v_me = p_candidate_id THEN
      v_access := 'self';
    ELSIF public.is_admin() THEN
      v_access := 'admin';
    -- Le reste est réservé aux employeurs : un abonnement Premium Candidat
    -- n'ouvre pas le numéro des autres candidats.
    ELSIF v_role = 'employer' THEN
      IF v_unlock.status = 'active' THEN
        v_access := 'unlocked';
      ELSIF EXISTS (
        SELECT 1 FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
         WHERE a.candidate_id = p_candidate_id
           AND j.employer_id = v_me
           AND public.job_is_paid(j.id)
      ) THEN
        v_access := 'applied';
      ELSIF public.has_active_premium(v_me) THEN
        v_access := 'premium';
      ELSIF v_unlock.status = 'pending_payment' THEN
        v_access := CASE WHEN v_unlock.payment_declared_at IS NULL THEN 'pending' ELSE 'declared' END;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT
    (v_candidate.phone IS NOT NULL OR v_candidate.whatsapp IS NOT NULL),
    v_access,
    v_unlock.id,
    CASE WHEN v_access IN ('self', 'admin', 'unlocked', 'applied', 'premium') THEN v_candidate.phone END,
    CASE WHEN v_access IN ('self', 'admin', 'unlocked', 'applied', 'premium') THEN v_candidate.whatsapp END,
    v_candidate.phone_verified_at IS NOT NULL;
END;
$$;

-- Ouverte aux visiteurs : sans numéro, elle leur dit seulement qu'il en existe
-- un, pour leur proposer de se connecter.
REVOKE ALL ON FUNCTION public.candidate_contact(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.candidate_contact(UUID) TO anon, authenticated, service_role;

-- Demander un déblocage ----------------------------------------------------------
-- Le prix est fixé ici et nulle part ailleurs : src/lib/contact/unlock.ts n'en
-- garde qu'une copie d'affichage.
CREATE OR REPLACE FUNCTION public.request_candidate_unlock(p_candidate_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := public.current_profile_id();
  v_candidate public.profiles%ROWTYPE;
  v_id        UUID;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND role = 'employer'
  ) THEN
    RAISE EXCEPTION 'Réservé aux employeurs.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.profiles
   WHERE id = p_candidate_id AND role = 'candidate' AND is_validated;
  IF v_candidate.id IS NULL THEN
    RAISE EXCEPTION 'Ce profil n''est pas disponible.';
  END IF;

  IF v_candidate.phone IS NULL AND v_candidate.whatsapp IS NULL THEN
    RAISE EXCEPTION 'Ce candidat n''a pas renseigné de numéro.';
  END IF;

  -- Une demande rejetée repart à zéro plutôt que d'en exiger une nouvelle :
  -- la contrainte d'unicité l'interdirait de toute façon.
  INSERT INTO public.candidate_unlocks (employer_id, candidate_id, price)
  VALUES (v_me, p_candidate_id, 500)
  ON CONFLICT (employer_id, candidate_id) DO UPDATE
     SET status              = 'pending_payment',
         payment_reference   = NULL,
         payment_declared_at = NULL
   WHERE public.candidate_unlocks.status = 'rejected'
  RETURNING id INTO v_id;

  -- Déjà demandé, en attente ou actif : on renvoie la ligne existante.
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.candidate_unlocks
     WHERE employer_id = v_me AND candidate_id = p_candidate_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_candidate_unlock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_candidate_unlock(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.declare_candidate_unlock_payment(
  p_unlock_id UUID,
  p_reference TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.candidate_unlocks
     SET payment_reference   = p_reference,
         payment_declared_at = NOW()
   WHERE id = p_unlock_id
     AND employer_id = public.current_profile_id()
     AND status = 'pending_payment';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Déblocage introuvable ou déjà réglé.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.declare_candidate_unlock_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_candidate_unlock_payment(UUID, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_candidate_unlock(
  p_unlock_id UUID,
  p_confirmed BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs.' USING ERRCODE = '42501';
  END IF;

  IF p_confirmed THEN
    UPDATE public.candidate_unlocks
       SET status               = 'active',
           payment_confirmed_at = NOW(),
           payment_confirmed_by = public.current_profile_id()
     WHERE id = p_unlock_id AND status = 'pending_payment';
  ELSE
    UPDATE public.candidate_unlocks
       SET status              = 'rejected',
           payment_reference   = NULL,
           payment_declared_at = NULL
     WHERE id = p_unlock_id AND status = 'pending_payment';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Déblocage introuvable ou déjà traité.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_candidate_unlock(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_candidate_unlock(UUID, BOOLEAN)
  TO authenticated, service_role;
