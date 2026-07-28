-- `profiles` carries phone, whatsapp, email and an exact GPS point, and its
-- SELECT policy exposes every validated row to everyone — including `anon`.
-- RLS filters rows, never columns, so although the app's own RPCs deliberately
-- omit those fields, PostgREST still serves them: with the anon key that ships
-- in the browser bundle, one request returns the phone number, email and home
-- coordinates of every validated candidate. For domestic workers that is a
-- physical-safety problem, not just a privacy one.
--
-- Column privileges are the fix RLS cannot express. Postgres has no way to
-- subtract a column from a table-wide grant, so the grant is dropped and
-- re-issued column by column.

REVOKE SELECT ON public.profiles FROM anon, authenticated;

-- Everything the application actually reads. `user_id` stays readable because
-- the session lookup filters on it, and a WHERE clause needs SELECT on the
-- column it references. It identifies nobody on its own.
GRANT SELECT (
  id,
  user_id,
  role,
  full_name,
  avatar_url,
  neighborhood_id,
  is_premium,
  is_validated,
  created_at,
  updated_at
) ON public.profiles TO anon, authenticated;

-- Writes are unchanged: the UPDATE policy plus protect_profile_columns() still
-- decide what a user may change, and a user updating their own phone number is
-- legitimate. Only reading other people's is not.

-- search_candidates / get_candidate ------------------------------------------
-- Both read `location` to compute distances, so revoking it would break the
-- proximity search they exist for. They move to SECURITY DEFINER, which runs
-- them as the owner and lifts both RLS and column privileges.
--
-- That makes the visibility rule this function's own responsibility: what RLS
-- used to enforce implicitly is now the explicit predicate below. Both
-- functions return only non-sensitive columns, so the elevated read stays
-- contained — no caller can select `location` through them, only a distance
-- derived from it.

CREATE OR REPLACE FUNCTION public.search_candidates(
  origin_lat DOUBLE PRECISION DEFAULT NULL,
  origin_lng DOUBLE PRECISION DEFAULT NULL,
  max_km DOUBLE PRECISION DEFAULT NULL,
  search TEXT DEFAULT NULL,
  availability_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  avatar_url TEXT,
  is_premium BOOLEAN,
  neighborhood TEXT,
  city TEXT,
  job_title TEXT,
  availability TEXT,
  distance_km DOUBLE PRECISION,
  rating NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    n.name AS neighborhood,
    c.name AS city,
    cd.job_title,
    cd.availability::TEXT,
    CASE
      WHEN o.g IS NOT NULL AND p.location IS NOT NULL
      THEN ROUND((ST_Distance(p.location, o.g) / 1000)::NUMERIC, 1)::DOUBLE PRECISION
    END AS distance_km,
    COALESCE(
      (SELECT ROUND(AVG(r.rating), 1) FROM public.reviews r WHERE r.reviewee_id = p.id),
      0
    ) AS rating
  FROM public.profiles p
  CROSS JOIN origin o
  LEFT JOIN public.neighborhoods n ON n.id = p.neighborhood_id
  LEFT JOIN public.cities c ON c.id = n.city_id
  LEFT JOIN public.candidate_details cd ON cd.profile_id = p.id
  WHERE p.role = 'candidate'
    -- Replaces the profiles SELECT policy, which no longer applies here.
    -- Deliberately narrower than that policy: it also revealed anyone you had
    -- exchanged a message with, which belongs in an inbox, not in search
    -- results for a profile still awaiting moderation.
    AND (p.is_validated OR p.user_id = auth.uid() OR public.is_admin())
    AND (
      search IS NULL OR search = ''
      OR p.full_name ILIKE '%' || search || '%'
      OR cd.job_title ILIKE '%' || search || '%'
      OR n.name ILIKE '%' || search || '%'
    )
    AND (
      availability_filter IS NULL OR availability_filter = ''
      OR cd.availability::TEXT = availability_filter
    )
    AND (
      max_km IS NULL OR o.g IS NULL OR p.location IS NULL
      OR ST_DWithin(p.location, o.g, max_km * 1000)
    )
  ORDER BY
    p.is_premium DESC,
    CASE WHEN o.g IS NOT NULL AND p.location IS NOT NULL
         THEN ST_Distance(p.location, o.g) END ASC NULLS LAST,
    rating DESC,
    p.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_candidate(
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
  -- Added by 20260727210000_verification_checks.sql. Kept in place: dropping
  -- them here would silently strip the verified badges off every public
  -- candidate page.
  identity_checked_at TIMESTAMPTZ,
  criminal_record_checked_at TIMESTAMPTZ,
  interview_passed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    AND p.role = 'candidate'
    -- Same guard as above: an unmoderated profile must stay unreachable even
    -- when its id is guessed, which the page turns into a 404.
    AND (p.is_validated OR p.user_id = auth.uid() OR public.is_admin());
$$;

-- Own contact details --------------------------------------------------------
-- Column privileges are absolute: the revoke above also stops owners reading
-- their *own* phone number, which the profile editor has to prefill. Handing
-- back only the caller's row keeps that working without reopening the table.
CREATE OR REPLACE FUNCTION public.my_contact()
RETURNS TABLE (phone TEXT, whatsapp TEXT, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phone, p.whatsapp, p.email
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
$$;

-- FROM PUBLIC, not FROM anon: Postgres grants EXECUTE to PUBLIC on every new
-- function, and revoking from a role that inherits it changes nothing. Anon
-- reaches no row today because auth.uid() is null, but that is an accident of
-- the body rather than a permission.
REVOKE EXECUTE ON FUNCTION public.my_contact() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_contact() TO authenticated, service_role;

-- Moderation queue -----------------------------------------------------------
-- The admin screen shows each applicant's email to tell duplicates apart and to
-- reach them. Admins share the `authenticated` database role, so no column
-- grant can single them out — a guarded function is the only way to hand the
-- address back to an admin and nobody else.
CREATE OR REPLACE FUNCTION public.admin_profile_emails(p_ids UUID[])
RETURNS TABLE (profile_id UUID, email TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT p.id, p.email
    FROM public.profiles p
    WHERE p.id = ANY(p_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_profile_emails(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_profile_emails(UUID[]) TO authenticated, service_role;
