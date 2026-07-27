-- Single candidate profile, same contract as search_candidates: SECURITY
-- INVOKER, so RLS decides visibility. A profile awaiting moderation therefore
-- cannot be reached by guessing its URL either — the function simply returns no
-- row and the page renders a 404.
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
  reviews_count BIGINT
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
    (SELECT COUNT(*) FROM public.reviews r WHERE r.reviewee_id = p.id) AS reviews_count
  FROM public.profiles p
  CROSS JOIN origin o
  LEFT JOIN public.neighborhoods n ON n.id = p.neighborhood_id
  LEFT JOIN public.cities c ON c.id = n.city_id
  LEFT JOIN public.candidate_details cd ON cd.profile_id = p.id
  WHERE p.id = candidate_id
    AND p.role = 'candidate';
$$;
