-- Dire si un numéro vendu a été confirmé par SMS.
--
-- Un numéro se paie (20261011040000, 20261011060000), mais rien ne garantit
-- qu'il est juste : « Continuer sans vérifier » laisse passer un numéro jamais
-- confirmé, et la vérification est suspendue quand le crédit SMS est épuisé.
-- Le cacher priverait l'acheteur de ce qu'il a payé ; on le signale donc.
--
-- Les trois fonctions qui remettent un numéro renvoient `phone_verified`.
-- Changer les colonnes renvoyées impose de les supprimer d'abord ; corps
-- repris à l'identique de leurs migrations d'origine.

DROP FUNCTION IF EXISTS public.job_contact(UUID);
DROP FUNCTION IF EXISTS public.my_unlocked_contacts();
DROP FUNCTION IF EXISTS public.my_applicant_contacts();

CREATE FUNCTION public.job_contact(p_job_id UUID)
RETURNS TABLE (
  has_number BOOLEAN,
  access     TEXT,
  unlock_id  UUID,
  full_name  TEXT,
  phone      TEXT,
  whatsapp   TEXT,
  phone_verified BOOLEAN
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
    CASE WHEN v_access IN ('owner', 'admin', 'unlocked', 'premium') THEN v_owner.whatsapp END,
    v_owner.phone_verified_at IS NOT NULL;
END;
$$;

CREATE FUNCTION public.my_unlocked_contacts()
RETURNS TABLE (
  job_id    UUID,
  job_title TEXT,
  full_name TEXT,
  phone     TEXT,
  whatsapp  TEXT,
  phone_verified BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.id, j.title, p.full_name, p.phone, p.whatsapp, p.phone_verified_at IS NOT NULL
    FROM public.contact_unlocks u
    JOIN public.jobs j ON j.id = u.job_id
    JOIN public.profiles p ON p.id = j.employer_id
   WHERE u.candidate_id = public.current_profile_id()
     AND u.status = 'active'
   ORDER BY u.payment_confirmed_at DESC NULLS LAST;
$$;

CREATE FUNCTION public.my_applicant_contacts()
RETURNS TABLE (
  application_id UUID,
  job_id         UUID,
  paid           BOOLEAN,
  phone          TEXT,
  whatsapp       TEXT,
  phone_verified BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT a.id AS application_id, j.id AS job_id, public.job_is_paid(j.id) AS paid,
           p.phone, p.whatsapp, p.phone_verified_at IS NOT NULL AS phone_verified
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      JOIN public.profiles p ON p.id = a.candidate_id
     WHERE j.employer_id = public.current_profile_id()
  )
  SELECT application_id, job_id, paid,
         CASE WHEN paid THEN phone END,
         CASE WHEN paid THEN whatsapp END,
         phone_verified
    FROM mine;
$$;

GRANT EXECUTE ON FUNCTION public.job_contact(UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.my_unlocked_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_unlocked_contacts() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.my_applicant_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_applicant_contacts() TO authenticated, service_role;
