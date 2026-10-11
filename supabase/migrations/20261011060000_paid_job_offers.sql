-- Offre gratuite ou offre payante.
--
-- Une offre payante (5 000 FCFA, une fois pour toute sa durée) montre à son
-- employeur le numéro de téléphone des candidats qui y postulent. Une offre
-- gratuite montre leur profil, sans numéro. L'abonnement Premium Employeur
-- rend payantes toutes les offres de l'employeur tant qu'il est actif.
--
-- C'est le pendant, côté employeur, de 20261011040000_employer_contact.sql :
-- même circuit de paiement manuel (identifiant de transaction déclaré, puis
-- validé par l'administration), même règle que le numéro ne sort que par une
-- fonction qui décide seule qui y a droit.

CREATE TABLE IF NOT EXISTS public.job_payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               UUID NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price                INT NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'XAF',
  status               TEXT NOT NULL DEFAULT 'pending_payment'
                       CHECK (status IN ('pending_payment', 'active', 'rejected')),
  payment_reference    TEXT,
  payment_declared_at  TIMESTAMPTZ,
  payment_confirmed_at TIMESTAMPTZ,
  payment_confirmed_by UUID REFERENCES public.profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_payments_declared
  ON public.job_payments (payment_declared_at)
  WHERE status = 'pending_payment' AND payment_declared_at IS NOT NULL;

ALTER TABLE public.job_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Job payments visible to their employer and admins." ON public.job_payments;
CREATE POLICY "Job payments visible to their employer and admins."
  ON public.job_payments FOR SELECT
  USING (employer_id = public.current_profile_id() OR public.is_admin());

-- Lecture seule, et rien pour un visiteur : la base hébergée accorde tout par
-- défaut sur une nouvelle table (voir 20261011040000).
REVOKE ALL ON public.job_payments FROM anon, authenticated;
GRANT SELECT ON public.job_payments TO authenticated;

-- Une offre est payante si son paiement a été validé, ou si son employeur a un
-- abonnement Premium en cours (has_active_premium lit l'échéance, pas le
-- drapeau `is_premium`, qui dépend de pg_cron).
CREATE OR REPLACE FUNCTION public.job_is_paid(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_payments
     WHERE job_id = p_job_id AND status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.jobs j
     WHERE j.id = p_job_id AND public.has_active_premium(j.employer_id)
  );
$$;

REVOKE ALL ON FUNCTION public.job_is_paid(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.job_is_paid(UUID) TO authenticated, service_role;

-- Les numéros des candidats ----------------------------------------------------
-- Pour chaque candidature reçue par l'appelant : le numéro du candidat si
-- l'offre est payante, rien sinon. Seules les offres de l'appelant comptent,
-- admin compris — l'administration lit les profils autrement.
CREATE OR REPLACE FUNCTION public.my_applicant_contacts()
RETURNS TABLE (
  application_id UUID,
  job_id         UUID,
  paid           BOOLEAN,
  phone          TEXT,
  whatsapp       TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT a.id AS application_id, j.id AS job_id, public.job_is_paid(j.id) AS paid,
           p.phone, p.whatsapp
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      JOIN public.profiles p ON p.id = a.candidate_id
     WHERE j.employer_id = public.current_profile_id()
  )
  SELECT application_id, job_id, paid,
         CASE WHEN paid THEN phone END,
         CASE WHEN paid THEN whatsapp END
    FROM mine;
$$;

REVOKE ALL ON FUNCTION public.my_applicant_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_applicant_contacts() TO authenticated, service_role;

-- Demander à passer une offre en payante ---------------------------------------
-- Le prix est fixé ici : src/lib/jobs/payment.ts n'en garde qu'une copie
-- d'affichage.
CREATE OR REPLACE FUNCTION public.request_job_payment(p_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := public.current_profile_id();
  v_id UUID;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.jobs WHERE id = p_job_id AND employer_id = v_me
  ) THEN
    RAISE EXCEPTION 'Offre introuvable.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.job_payments (job_id, employer_id, price)
  VALUES (p_job_id, v_me, 5000)
  ON CONFLICT (job_id) DO UPDATE
     SET status              = 'pending_payment',
         payment_reference   = NULL,
         payment_declared_at = NULL
   WHERE public.job_payments.status = 'rejected'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.job_payments WHERE job_id = p_job_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_job_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_job_payment(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.declare_job_payment(p_payment_id UUID, p_reference TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.job_payments
     SET payment_reference   = p_reference,
         payment_declared_at = NOW()
   WHERE id = p_payment_id
     AND employer_id = public.current_profile_id()
     AND status = 'pending_payment';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paiement introuvable ou déjà réglé.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.declare_job_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_job_payment(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_job_payment(p_payment_id UUID, p_confirmed BOOLEAN)
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
    UPDATE public.job_payments
       SET status               = 'active',
           payment_confirmed_at = NOW(),
           payment_confirmed_by = public.current_profile_id()
     WHERE id = p_payment_id AND status = 'pending_payment';
  ELSE
    UPDATE public.job_payments
       SET status              = 'rejected',
           payment_reference   = NULL,
           payment_declared_at = NULL
     WHERE id = p_payment_id AND status = 'pending_payment';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paiement introuvable ou déjà traité.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_job_payment(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_job_payment(UUID, BOOLEAN) TO authenticated, service_role;
