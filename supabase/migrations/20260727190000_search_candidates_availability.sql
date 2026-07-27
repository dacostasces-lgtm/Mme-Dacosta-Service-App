-- Adds an availability filter to search_candidates so the filter panel is fully
-- backed by the query rather than trimmed afterwards in the page.
--
-- DROP first: adding a parameter changes the signature, so CREATE OR REPLACE
-- would register a second overload and leave PostgREST with an ambiguous call.
DROP FUNCTION IF EXISTS public.search_candidates(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT
);

CREATE FUNCTION public.search_candidates(
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
  -- Premium first (that is what the subscription buys), then nearest, then best
  -- rated. Profiles without a position sort last rather than disappearing.
  ORDER BY
    p.is_premium DESC,
    CASE WHEN o.g IS NOT NULL AND p.location IS NOT NULL
         THEN ST_Distance(p.location, o.g) END ASC NULLS LAST,
    rating DESC,
    p.created_at DESC;
$$;
