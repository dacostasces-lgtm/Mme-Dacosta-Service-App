-- Turns the three trust claims on a candidate profile into recorded facts.
-- They used to be hardcoded on every profile page and backed by nothing, which
-- is the kind of promise that becomes a liability the day something goes wrong
-- in a client's home.
--
-- Each check stores who confirmed it and when, so a claim on the public profile
-- can always be traced back to a named moderator.

ALTER TABLE public.candidate_details
  ADD COLUMN IF NOT EXISTS identity_checked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_checked_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS criminal_record_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS criminal_record_checked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interview_passed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_passed_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Only admins may assert a verification. Candidates can still edit the rest of
-- their own details, so this mirrors protect_profile_columns one table down:
-- a non-admin update silently keeps the previous verification state.
CREATE OR REPLACE FUNCTION public.protect_verification_columns()
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

  NEW.identity_checked_at        := OLD.identity_checked_at;
  NEW.identity_checked_by        := OLD.identity_checked_by;
  NEW.criminal_record_checked_at := OLD.criminal_record_checked_at;
  NEW.criminal_record_checked_by := OLD.criminal_record_checked_by;
  NEW.interview_passed_at        := OLD.interview_passed_at;
  NEW.interview_passed_by        := OLD.interview_passed_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_verification_columns ON public.candidate_details;
CREATE TRIGGER protect_verification_columns
  BEFORE UPDATE ON public.candidate_details
  FOR EACH ROW EXECUTE FUNCTION public.protect_verification_columns();

-- Expose the checks on the public profile. Only the booleans and dates surface,
-- never the moderator's identity.
--
-- DROP first: the returned row type gains three columns, and CREATE OR REPLACE
-- cannot change the shape of an existing function's OUT parameters.
DROP FUNCTION IF EXISTS public.get_candidate(UUID, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE FUNCTION public.get_candidate(
  candidate_id UUID,
  origin_lat DOUBLE PRECISION DEFAULT NULL,
  origin_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  avatar_url TEXT,
  is_premium BOOLEAN,
  is_validated BOOLEAN,
  neighborhood TEXT,
  city TEXT,
  job_title TEXT,
  experience TEXT,
  description TEXT,
  skills JSONB,
  languages JSONB,
  desired_salary INT,
  availability TEXT,
  distance_km DOUBLE PRECISION,
  rating NUMERIC,
  reviews_count BIGINT,
  identity_checked_at TIMESTAMPTZ,
  criminal_record_checked_at TIMESTAMPTZ,
  interview_passed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH origin AS (
    SELECT COALESCE(
      CASE
        WHEN origin_lat IS NOT NULL AND origin_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(origin_lng, origin_lat), 4326)::geography
      END,
      (SELECT me.location FROM public.profiles me WHERE me.user_id = auth.uid())
    ) AS g
  )
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.is_premium,
    p.is_validated,
    n.name AS neighborhood,
    c.name AS city,
    cd.job_title,
    cd.experience,
    cd.description,
    cd.skills,
    cd.languages,
    cd.desired_salary,
    cd.availability::TEXT,
    CASE
      WHEN o.g IS NOT NULL AND p.location IS NOT NULL
      THEN ROUND((ST_Distance(p.location, o.g) / 1000)::NUMERIC, 1)::DOUBLE PRECISION
    END AS distance_km,
    COALESCE(
      (SELECT ROUND(AVG(r.rating), 1) FROM public.reviews r WHERE r.reviewee_id = p.id),
      0
    ) AS rating,
    (SELECT COUNT(*) FROM public.reviews r WHERE r.reviewee_id = p.id) AS reviews_count,
    cd.identity_checked_at,
    cd.criminal_record_checked_at,
    cd.interview_passed_at
  FROM public.profiles p
  CROSS JOIN origin o
  LEFT JOIN public.neighborhoods n ON n.id = p.neighborhood_id
  LEFT JOIN public.cities c ON c.id = n.city_id
  LEFT JOIN public.candidate_details cd ON cd.profile_id = p.id
  WHERE p.id = candidate_id
    AND p.role = 'candidate';
$$;

-- Records or clears one check, stamping the acting admin. SECURITY INVOKER, so
-- an ordinary caller is stopped by the policy and the trigger above.
CREATE OR REPLACE FUNCTION public.set_candidate_check(
  candidate_id UUID,
  check_name TEXT,
  checked BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_admin_profile UUID;
  v_at TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut enregistrer une vérification.';
  END IF;

  SELECT id INTO v_admin_profile FROM public.profiles WHERE user_id = auth.uid();
  v_at := CASE WHEN checked THEN NOW() END;

  IF check_name = 'identity' THEN
    UPDATE public.candidate_details
       SET identity_checked_at = v_at,
           identity_checked_by = CASE WHEN checked THEN v_admin_profile END
     WHERE profile_id = candidate_id;
  ELSIF check_name = 'criminal_record' THEN
    UPDATE public.candidate_details
       SET criminal_record_checked_at = v_at,
           criminal_record_checked_by = CASE WHEN checked THEN v_admin_profile END
     WHERE profile_id = candidate_id;
  ELSIF check_name = 'interview' THEN
    UPDATE public.candidate_details
       SET interview_passed_at = v_at,
           interview_passed_by = CASE WHEN checked THEN v_admin_profile END
     WHERE profile_id = candidate_id;
  ELSE
    RAISE EXCEPTION 'Contrôle inconnu : %', check_name;
  END IF;
END;
$$;
