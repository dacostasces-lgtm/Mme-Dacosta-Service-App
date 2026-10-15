-- Jours et horaires de disponibilité d'un candidat, et s'il accepte de dormir
-- sur place — le pendant de 20261011010000_job_schedule.sql pour les offres.
--
-- Mêmes codes de jours que `jobs.work_days`, fixés par src/lib/jobs/schedule.ts,
-- pour qu'une offre et un profil se comparent directement.

ALTER TABLE public.candidate_details
  ADD COLUMN IF NOT EXISTS work_days TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS live_in BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.candidate_details DROP CONSTRAINT IF EXISTS candidate_details_work_days_valid;
ALTER TABLE public.candidate_details
  ADD CONSTRAINT candidate_details_work_days_valid
  CHECK (work_days <@ ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::TEXT[]);

-- Les deux fonctions changent de colonnes renvoyées, et search_candidates de
-- paramètres : CREATE OR REPLACE refuserait le premier changement et créerait
-- une seconde surcharge pour le second. On les supprime d'abord. Corps repris
-- de 20260728010000_restrict_profile_pii.sql, dont la garde de visibilité.
DROP FUNCTION IF EXISTS public.search_candidates(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT
);
-- Et la nouvelle signature, sans quoi ce fichier n'est pas rejouable : le DROP
-- ci-dessus ne vise que l'ancienne, et le CREATE plus bas bute alors sur
-- « function already exists » (42723) dès la seconde exécution. C'est
-- exactement ce qui s'est produit le 15 octobre 2026, en recollant ce fichier
-- sur une base qui l'avait déjà reçu — l'historique des migrations distant
-- ayant perdu la trace de son application.
DROP FUNCTION IF EXISTS public.search_candidates(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT,
  TEXT[], TIME, TIME, BOOLEAN
);
DROP FUNCTION IF EXISTS public.get_candidate(UUID, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE FUNCTION public.search_candidates(
  origin_lat DOUBLE PRECISION DEFAULT NULL,
  origin_lng DOUBLE PRECISION DEFAULT NULL,
  max_km DOUBLE PRECISION DEFAULT NULL,
  search TEXT DEFAULT NULL,
  availability_filter TEXT DEFAULT NULL,
  days_filter TEXT[] DEFAULT NULL,
  start_filter TIME DEFAULT NULL,
  end_filter TIME DEFAULT NULL,
  live_in_filter BOOLEAN DEFAULT NULL
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
  rating NUMERIC,
  work_days TEXT[],
  start_time TIME,
  end_time TIME,
  live_in BOOLEAN
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
    ) AS rating,
    COALESCE(cd.work_days, '{}'),
    cd.start_time,
    cd.end_time,
    COALESCE(cd.live_in, FALSE)
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
    -- Jours et horaires : un candidat qui ne les a pas précisés n'est pas
    -- écarté, rien ne dit qu'il ne convient pas.
    AND (
      days_filter IS NULL OR cardinality(days_filter) = 0
      OR cardinality(COALESCE(cd.work_days, '{}')) = 0
      OR cd.work_days @> days_filter
    )
    AND (start_filter IS NULL OR cd.start_time IS NULL OR cd.start_time <= start_filter)
    AND (end_filter IS NULL OR cd.end_time IS NULL OR cd.end_time >= end_filter)
    -- « Interne (logé) » disait déjà la même chose avant cette colonne.
    AND (
      live_in_filter IS NOT TRUE
      OR cd.live_in OR cd.availability = 'internal'
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
  -- Added by 20260727210000_verification_checks.sql. Kept in place: dropping
  -- them here would silently strip the verified badges off every public
  -- candidate page.
  identity_checked_at TIMESTAMPTZ,
  criminal_record_checked_at TIMESTAMPTZ,
  interview_passed_at TIMESTAMPTZ,
  work_days TEXT[],
  start_time TIME,
  end_time TIME,
  live_in BOOLEAN
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
    cd.interview_passed_at,
    COALESCE(cd.work_days, '{}'),
    cd.start_time,
    cd.end_time,
    COALESCE(cd.live_in, FALSE)
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

-- Recréées, les fonctions repartent des droits par défaut. La recherche et les
-- fiches sont publiques : les droits sont posés ici plutôt que laissés à ces
-- défauts, qui ne sont pas les mêmes en local et en production
-- (voir 20260728060000_fix_function_grants.sql).
GRANT EXECUTE ON FUNCTION public.search_candidates(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT[], TIME, TIME, BOOLEAN
) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_candidate(UUID, DOUBLE PRECISION, DOUBLE PRECISION)
  TO anon, authenticated, service_role;
