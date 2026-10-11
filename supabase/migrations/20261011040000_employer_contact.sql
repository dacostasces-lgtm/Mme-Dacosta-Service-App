-- Le numéro d'un employeur, accessible contre paiement.
--
-- Deux façons d'y accéder pour un candidat :
--   * l'abonnement Premium Candidat, qui ouvre les numéros de toutes les offres ;
--   * le déblocage à l'unité, payé pour une seule offre.
--
-- Le numéro vit dans `profiles.phone` / `profiles.whatsapp`, illisibles par
-- l'API depuis 20260728010000_restrict_profile_pii.sql. Il ne sort que par
-- job_contact() ci-dessous, qui décide seule qui y a droit : aucune page ne
-- reçoit le numéro pour le masquer ensuite côté client.
--
-- Le paiement suit le même circuit manuel que les abonnements : le candidat
-- déclare l'identifiant de transaction Mobile Money, un administrateur le
-- rapproche du relevé avant que quoi que ce soit ne soit ouvert.

CREATE TABLE IF NOT EXISTS public.contact_unlocks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id               UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  price                INT NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'XAF',
  status               TEXT NOT NULL DEFAULT 'pending_payment'
                       CHECK (status IN ('pending_payment', 'active', 'rejected')),
  payment_reference    TEXT,
  payment_declared_at  TIMESTAMPTZ,
  payment_confirmed_at TIMESTAMPTZ,
  payment_confirmed_by UUID REFERENCES public.profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un seul déblocage par offre et par candidat : payer deux fois le même
  -- numéro n'a pas de sens, et l'administration n'aurait aucun moyen de savoir
  -- à quelle ligne rattacher un versement.
  UNIQUE (candidate_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_unlocks_declared
  ON public.contact_unlocks (payment_declared_at)
  WHERE status = 'pending_payment' AND payment_declared_at IS NOT NULL;

ALTER TABLE public.contact_unlocks ENABLE ROW LEVEL SECURITY;

-- Lecture seule pour l'API : toute écriture passe par les fonctions ci-dessous,
-- qui fixent le prix et l'état. Pas de politique d'insertion ni de mise à jour,
-- donc pas de ligne « active » fabriquée par un client.
DROP POLICY IF EXISTS "Unlocks visible to their buyer and admins." ON public.contact_unlocks;
CREATE POLICY "Unlocks visible to their buyer and admins."
  ON public.contact_unlocks FOR SELECT
  USING (candidate_id = public.current_profile_id() OR public.is_admin());

-- La base hébergée accorde tout, sur chaque nouvelle table, à `anon` et
-- `authenticated` (ALTER DEFAULT PRIVILEGES, voir 20260728060000). La RLS
-- refuse déjà ces accès, mais le droit lui-même est retiré : la lecture pour
-- l'acheteur, rien d'autre, et rien pour un visiteur.
REVOKE ALL ON public.contact_unlocks FROM anon, authenticated;
GRANT SELECT ON public.contact_unlocks TO authenticated;

-- Premium actif, lu sur l'abonnement plutôt que sur `profiles.is_premium` :
-- le drapeau n'est remis à faux que par expire_subscriptions(), qui dépend de
-- pg_cron. L'échéance, elle, ne peut pas être en retard.
CREATE OR REPLACE FUNCTION public.has_active_premium(p_profile UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.profile_id = p_profile
       AND s.is_active
       AND s.status = 'active'
       AND (s.end_date IS NULL OR s.end_date > NOW())
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_premium(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_premium(UUID) TO authenticated, service_role;

-- Le contact d'une offre, et ce que l'appelant peut en voir -------------------
--
-- `access` dit pourquoi le numéro est montré, ou ce qui manque :
--   owner / admin / premium / unlocked  → numéro renvoyé
--   pending   → déblocage demandé, paiement pas encore déclaré
--   declared  → paiement déclaré, en attente de validation
--   none      → rien
-- `has_number` est renvoyé à tous, pour ne jamais faire payer un numéro qui
-- n'existe pas.
CREATE OR REPLACE FUNCTION public.job_contact(p_job_id UUID)
RETURNS TABLE (
  has_number BOOLEAN,
  access     TEXT,
  unlock_id  UUID,
  full_name  TEXT,
  phone      TEXT,
  whatsapp   TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := public.current_profile_id();
  v_job    public.jobs%ROWTYPE;
  v_owner  public.profiles%ROWTYPE;
  v_unlock public.contact_unlocks%ROWTYPE;
  v_access TEXT := 'none';
  v_open   BOOLEAN;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  v_open := v_job.status = 'active' AND v_job.expires_at > NOW();

  -- Une offre fermée ou échue n'est plus publique : seuls son employeur,
  -- l'administration et un candidat qui avait déjà payé la voient encore.
  SELECT * INTO v_owner FROM public.profiles WHERE id = v_job.employer_id;

  IF v_me IS NOT NULL THEN
    SELECT * INTO v_unlock FROM public.contact_unlocks
     WHERE job_id = p_job_id AND candidate_id = v_me;

    IF v_me = v_job.employer_id THEN
      v_access := 'owner';
    ELSIF public.is_admin() THEN
      v_access := 'admin';
    ELSIF v_unlock.status = 'active' THEN
      v_access := 'unlocked';
    ELSIF v_open AND public.has_active_premium(v_me) THEN
      v_access := 'premium';
    ELSIF v_unlock.status = 'pending_payment' THEN
      v_access := CASE WHEN v_unlock.payment_declared_at IS NULL THEN 'pending' ELSE 'declared' END;
    END IF;
  END IF;

  IF NOT v_open AND v_access IN ('none', 'pending', 'declared') THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT
    (v_owner.phone IS NOT NULL OR v_owner.whatsapp IS NOT NULL),
    v_access,
    v_unlock.id,
    CASE WHEN v_access IN ('owner', 'admin', 'unlocked', 'premium') THEN v_owner.full_name END,
    CASE WHEN v_access IN ('owner', 'admin', 'unlocked', 'premium') THEN v_owner.phone END,
    CASE WHEN v_access IN ('owner', 'admin', 'unlocked', 'premium') THEN v_owner.whatsapp END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.job_contact(UUID) TO anon, authenticated, service_role;

-- Demander un déblocage ----------------------------------------------------------
-- Le prix est fixé ici et nulle part ailleurs : un montant envoyé par le
-- navigateur serait un montant choisi par l'acheteur. src/lib/contact/unlock.ts
-- n'en garde qu'une copie d'affichage.
CREATE OR REPLACE FUNCTION public.request_contact_unlock(p_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := public.current_profile_id();
  v_job   public.jobs%ROWTYPE;
  v_owner public.profiles%ROWTYPE;
  v_id    UUID;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND role = 'candidate'
  ) THEN
    RAISE EXCEPTION 'Réservé aux candidats.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job FROM public.jobs
   WHERE id = p_job_id AND status = 'active' AND expires_at > NOW();
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Cette offre n''est plus disponible.';
  END IF;

  SELECT * INTO v_owner FROM public.profiles WHERE id = v_job.employer_id;
  IF v_owner.phone IS NULL AND v_owner.whatsapp IS NULL THEN
    RAISE EXCEPTION 'Cet employeur n''a pas renseigné de numéro : contactez-le par la messagerie.';
  END IF;

  -- Une demande rejetée repart à zéro plutôt que d'en exiger une nouvelle :
  -- la contrainte d'unicité l'interdirait de toute façon.
  INSERT INTO public.contact_unlocks (candidate_id, job_id, price)
  VALUES (v_me, p_job_id, 500)
  ON CONFLICT (candidate_id, job_id) DO UPDATE
     SET status              = 'pending_payment',
         payment_reference   = NULL,
         payment_declared_at = NULL
   WHERE public.contact_unlocks.status = 'rejected'
  RETURNING id INTO v_id;

  -- Déjà demandé, en attente ou actif : on renvoie la ligne existante.
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.contact_unlocks
     WHERE candidate_id = v_me AND job_id = p_job_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_contact_unlock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_contact_unlock(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.declare_contact_unlock_payment(
  p_unlock_id UUID,
  p_reference TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contact_unlocks
     SET payment_reference   = p_reference,
         payment_declared_at = NOW()
   WHERE id = p_unlock_id
     AND candidate_id = public.current_profile_id()
     AND status = 'pending_payment';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Déblocage introuvable ou déjà réglé.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.declare_contact_unlock_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_contact_unlock_payment(UUID, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_contact_unlock(
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
    UPDATE public.contact_unlocks
       SET status               = 'active',
           payment_confirmed_at = NOW(),
           payment_confirmed_by = public.current_profile_id()
     WHERE id = p_unlock_id AND status = 'pending_payment';
  ELSE
    UPDATE public.contact_unlocks
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

REVOKE ALL ON FUNCTION public.settle_contact_unlock(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_contact_unlock(UUID, BOOLEAN)
  TO authenticated, service_role;

-- Les numéros débloqués par l'appelant -----------------------------------------
-- Pour son tableau de bord. Une offre fermée ou échue n'est plus lisible par
-- l'API, mais un numéro payé reste acquis : le titre de l'offre est donc
-- renvoyé ici plutôt que lu par une jointure que la RLS viderait.
CREATE OR REPLACE FUNCTION public.my_unlocked_contacts()
RETURNS TABLE (
  job_id    UUID,
  job_title TEXT,
  full_name TEXT,
  phone     TEXT,
  whatsapp  TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.id, j.title, p.full_name, p.phone, p.whatsapp
    FROM public.contact_unlocks u
    JOIN public.jobs j ON j.id = u.job_id
    JOIN public.profiles p ON p.id = j.employer_id
   WHERE u.candidate_id = public.current_profile_id()
     AND u.status = 'active'
   ORDER BY u.payment_confirmed_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.my_unlocked_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_unlocked_contacts() TO authenticated, service_role;
