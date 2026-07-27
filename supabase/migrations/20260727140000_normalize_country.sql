-- The signup trigger looks a city up by (name, country), so two spellings of the
-- same country fork the whole geography: a real signup produced
-- `Brazzaville / Congo` (what Nominatim returns in French) while our own default
-- produced `Brazzaville / Congo-Brazzaville`, each with its own Bacongo. Left
-- alone this fragments the reference data and breaks proximity search.
--
-- Fix in three parts: canonicalise the country on write, merge what already
-- diverged, and add unique indexes so it cannot happen again.

-- 1. Country canonicalisation ------------------------------------------------
-- Nominatim returns "Congo" for Congo-Brazzaville and "République démocratique
-- du Congo" for the DRC, so a bare "Congo" maps to Brazzaville.
CREATE OR REPLACE FUNCTION public.normalize_country(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL OR TRIM(raw) = '' THEN 'Congo-Brazzaville'
    WHEN k IN ('rdc', 'rd congo', 'drc', 'congo kinshasa', 'congo-kinshasa',
               'republique democratique du congo',
               'democratic republic of the congo', 'zaire')
      THEN 'Congo-Kinshasa'
    WHEN k IN ('congo', 'congo brazzaville', 'congo-brazzaville', 'rc', 'roc',
               'republique du congo', 'republic of the congo', 'the congo')
      THEN 'Congo-Brazzaville'
    ELSE TRIM(raw)
  END
  FROM (
    SELECT LOWER(TRIM(TRANSLATE(raw, 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'))) AS k
  ) t;
$$;

-- 2. Merge what already diverged ---------------------------------------------
UPDATE public.cities SET country = public.normalize_country(country);

-- Move neighborhoods of duplicate cities onto the oldest twin, then drop the twins.
WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER w AS keep_id,
         ROW_NUMBER()    OVER w AS rn
  FROM public.cities
  WINDOW w AS (PARTITION BY LOWER(name), country ORDER BY created_at)
)
UPDATE public.neighborhoods n
SET city_id = r.keep_id
FROM ranked r
WHERE n.city_id = r.id AND r.rn > 1;

DELETE FROM public.cities c
WHERE EXISTS (
  SELECT 1 FROM public.cities k
  WHERE LOWER(k.name) = LOWER(c.name)
    AND k.country = c.country
    AND k.created_at < c.created_at
);

-- Same treatment one level down: profiles point at neighborhoods, not cities.
WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER w AS keep_id,
         ROW_NUMBER()    OVER w AS rn
  FROM public.neighborhoods
  WINDOW w AS (PARTITION BY city_id, LOWER(name) ORDER BY created_at)
)
UPDATE public.profiles p
SET neighborhood_id = r.keep_id
FROM ranked r
WHERE p.neighborhood_id = r.id AND r.rn > 1;

DELETE FROM public.neighborhoods n
WHERE EXISTS (
  SELECT 1 FROM public.neighborhoods k
  WHERE k.city_id = n.city_id
    AND LOWER(k.name) = LOWER(n.name)
    AND k.created_at < n.created_at
);

-- 3. Make the duplication impossible -----------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS cities_name_country_key
  ON public.cities (LOWER(name), country);
CREATE UNIQUE INDEX IF NOT EXISTS neighborhoods_city_name_key
  ON public.neighborhoods (city_id, LOWER(name));

-- 4. Normalise on write ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_role public.user_role;
  v_full_name TEXT;
  v_country TEXT := public.normalize_country(meta->>'country');
  v_city TEXT := NULLIF(TRIM(meta->>'city'), '');
  v_neighborhood TEXT := NULLIF(TRIM(meta->>'neighborhood'), '');
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_city_id UUID;
  v_neighborhood_id UUID;
  v_location geography(Point, 4326);
  v_profile_id UUID;
BEGIN
  v_role := CASE meta->>'role'
    WHEN 'employer' THEN 'employer'::public.user_role
    ELSE 'candidate'::public.user_role
  END;

  v_full_name := COALESCE(
    NULLIF(TRIM(meta->>'full_name'), ''),
    SPLIT_PART(COALESCE(NEW.email, 'utilisateur'), '@', 1)
  );

  BEGIN
    v_lat := (meta->>'lat')::DOUBLE PRECISION;
    v_lng := (meta->>'lng')::DOUBLE PRECISION;
  EXCEPTION WHEN OTHERS THEN
    v_lat := NULL;
    v_lng := NULL;
  END;

  IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    v_location := ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography;
  END IF;

  IF v_city IS NOT NULL THEN
    SELECT id INTO v_city_id FROM public.cities
    WHERE LOWER(name) = LOWER(v_city) AND country = v_country
    LIMIT 1;

    IF v_city_id IS NULL THEN
      INSERT INTO public.cities (name, country)
      VALUES (v_city, v_country)
      ON CONFLICT (LOWER(name), country) DO UPDATE SET name = EXCLUDED.name
      RETURNING id INTO v_city_id;
    END IF;

    IF v_neighborhood IS NOT NULL THEN
      SELECT id INTO v_neighborhood_id FROM public.neighborhoods
      WHERE LOWER(name) = LOWER(v_neighborhood) AND city_id = v_city_id
      LIMIT 1;

      IF v_neighborhood_id IS NULL THEN
        INSERT INTO public.neighborhoods (name, city_id)
        VALUES (v_neighborhood, v_city_id)
        ON CONFLICT (city_id, LOWER(name)) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_neighborhood_id;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.profiles (user_id, role, full_name, email, neighborhood_id, location)
  VALUES (NEW.id, v_role, v_full_name, NEW.email, v_neighborhood_id, v_location)
  RETURNING id INTO v_profile_id;

  IF v_role = 'candidate' THEN
    INSERT INTO public.candidate_details (profile_id) VALUES (v_profile_id);
  ELSE
    INSERT INTO public.employer_details (profile_id) VALUES (v_profile_id);
  END IF;

  RETURN NEW;
END;
$$;
