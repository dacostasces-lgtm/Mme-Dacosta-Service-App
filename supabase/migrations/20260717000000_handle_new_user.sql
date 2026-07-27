-- Automatically create a profile (plus role details row) when a user signs up.
-- Signup metadata comes from the client and is untrusted: the role is whitelisted
-- so a crafted payload can never mint an admin profile.
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
  v_country TEXT := NULLIF(TRIM(meta->>'country'), '');
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
    WHERE LOWER(name) = LOWER(v_city)
      AND (v_country IS NULL OR LOWER(country) = LOWER(v_country))
    LIMIT 1;

    IF v_city_id IS NULL THEN
      INSERT INTO public.cities (name, country)
      VALUES (v_city, COALESCE(v_country, 'Côte d''Ivoire'))
      RETURNING id INTO v_city_id;
    END IF;

    IF v_neighborhood IS NOT NULL THEN
      SELECT id INTO v_neighborhood_id FROM public.neighborhoods
      WHERE LOWER(name) = LOWER(v_neighborhood) AND city_id = v_city_id
      LIMIT 1;

      IF v_neighborhood_id IS NULL THEN
        INSERT INTO public.neighborhoods (name, city_id)
        VALUES (v_neighborhood, v_city_id)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
