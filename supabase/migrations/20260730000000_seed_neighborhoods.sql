-- Turns the location fields into a closed reference list.
--
-- Signup asked for country, city and quartier as free text, and the trigger
-- created whatever arrived. That is how production ended up with two
-- "Brazzaville" rows — one from Nominatim's "Congo", one from our own
-- "Congo-Brazzaville" — each with its own Bacongo. Normalising the country
-- stopped the bleeding; this removes the wound, by seeding the real
-- administrative divisions and letting the form offer nothing else.
--
-- Arrondissements rather than quartiers on purpose: the 9 of Brazzaville and the
-- 6 of Pointe-Noire are an official, complete, verifiable list, and they are
-- what people actually say ("j'habite à Bacongo"). Quartiers run into the
-- hundreds with no authoritative public list — seeding a half-invented set would
-- reintroduce exactly the mess this replaces.

INSERT INTO public.cities (name, country)
VALUES
  ('Brazzaville',  'Congo-Brazzaville'),
  ('Pointe-Noire', 'Congo-Brazzaville')
ON CONFLICT (LOWER(name), country) DO NOTHING;

INSERT INTO public.neighborhoods (name, city_id)
SELECT quartier, c.id
FROM public.cities c
CROSS JOIN LATERAL (
  SELECT unnest(
    CASE LOWER(c.name)
      WHEN 'brazzaville' THEN ARRAY[
        'Makélékélé', 'Bacongo', 'Poto-Poto', 'Moungali', 'Ouenzé',
        'Talangaï', 'Mfilou', 'Madibou', 'Djiri'
      ]
      WHEN 'pointe-noire' THEN ARRAY[
        'Lumumba', 'Mvoumvou', 'Tié-Tié', 'Loandjili', 'Mongo-Mpoukou', 'Ngoyo'
      ]
      ELSE ARRAY[]::TEXT[]
    END
  ) AS quartier
) q
WHERE c.country = 'Congo-Brazzaville'
ON CONFLICT (city_id, LOWER(name)) DO NOTHING;

-- The trigger now prefers a `neighborhood_id` chosen from that list, and only
-- falls back to the old text path for accounts created outside the form (a
-- Supabase dashboard invite, a seed script). The fallback still cannot invent a
-- quartier: an unknown name is ignored rather than inserted, so the reference
-- list stays closed.
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
  v_neighborhood_id UUID;
  -- Signup now asks for a phone number: for domestic work it is the channel
  -- that actually gets used, far more than email. Already normalised by the
  -- form; capped here so a crafted payload cannot write an essay into it.
  v_phone TEXT := NULLIF(LEFT(TRIM(meta->>'phone'), 32), '');
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_city_id UUID;
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

  -- Preferred path: an id picked from the seeded list. Validated against the
  -- table rather than trusted, since signup metadata comes from the browser.
  BEGIN
    SELECT n.id INTO v_neighborhood_id
      FROM public.neighborhoods n
     WHERE n.id = (meta->>'neighborhood_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_neighborhood_id := NULL;
  END;

  -- Fallback for accounts not created through the form: match on name, never
  -- insert. An unrecognised quartier leaves the profile without one, which the
  -- profile screen then asks the user to fix.
  IF v_neighborhood_id IS NULL AND v_city IS NOT NULL THEN
    SELECT id INTO v_city_id FROM public.cities
     WHERE LOWER(name) = LOWER(v_city) AND country = v_country
     LIMIT 1;

    IF v_city_id IS NOT NULL AND v_neighborhood IS NOT NULL THEN
      SELECT id INTO v_neighborhood_id FROM public.neighborhoods
       WHERE city_id = v_city_id AND LOWER(name) = LOWER(v_neighborhood)
       LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.profiles (
    user_id, role, full_name, email, phone, neighborhood_id, location
  )
  VALUES (
    NEW.id, v_role, v_full_name, NEW.email, v_phone, v_neighborhood_id, v_location
  )
  RETURNING id INTO v_profile_id;

  IF v_role = 'candidate' THEN
    INSERT INTO public.candidate_details (profile_id) VALUES (v_profile_id);
  ELSE
    INSERT INTO public.employer_details (profile_id) VALUES (v_profile_id);
  END IF;

  RETURN NEW;
END;
$$;
