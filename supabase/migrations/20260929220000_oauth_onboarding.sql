-- Fin d'inscription pour les comptes créés sans passer par notre formulaire.
--
-- « Continuer avec Google » ne transmet ni rôle ni quartier : Google ne sait
-- pas si la personne recrute ou cherche un emploi. Le déclencheur
-- handle_new_user retombe alors sur 'candidate', et protect_profile_columns
-- gèle la colonne role — un employeur arrivé par Google serait enfermé dans le
-- mauvais espace sans aucun moyen d'en sortir, ni pour lui ni pour nous sans
-- passer par la base.
--
-- D'où une colonne qui distingue « a choisi candidat » de « n'a jamais
-- choisi », et une fonction qui laisse trancher une fois, une seule.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.onboarding_completed_at IS
  'Horodatage du choix de rôle. NULL tant que le compte n''a pas fini son inscription — cas des comptes OAuth, que le rôle par défaut ne représente pas.';

-- Les comptes existants viennent tous du formulaire, qui impose le rôle : ils
-- ont déjà choisi. Sans ce rattrapage, la porte posée plus bas les renverrait
-- tous vers un écran d'inscription qu'ils ont franchi il y a des semaines.
UPDATE public.profiles
   SET onboarding_completed_at = COALESCE(created_at, NOW())
 WHERE onboarding_completed_at IS NULL;

GRANT SELECT (onboarding_completed_at) ON public.profiles TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Le déclencheur d'inscription marque l'étape franchie quand le rôle vient du
-- formulaire, et la laisse ouverte sinon.
-- ---------------------------------------------------------------------------

-- Repris mot pour mot de 20260730000000, à trois ajouts près, signalés en
-- commentaire. Le reste — le numéro, normalize_country, le quartier validé
-- contre la liste fermée plutôt qu'inventé depuis du texte libre — doit être
-- reconduit tel quel : un CREATE OR REPLACE écrit la fonction entière, donc
-- repartir d'une version antérieure en annulerait silencieusement l'essentiel.
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
  v_phone TEXT := NULLIF(LEFT(TRIM(meta->>'phone'), 32), '');
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_city_id UUID;
  v_location geography(Point, 4326);
  v_profile_id UUID;
  -- AJOUT : la présence de la clé, pas sa valeur. C'est ce qui sépare notre
  -- formulaire, qui impose un rôle, d'un fournisseur externe qui n'en donne
  -- aucun.
  v_from_form BOOLEAN := NULLIF(TRIM(meta->>'role'), '') IS NOT NULL;
BEGIN
  v_role := CASE meta->>'role'
    WHEN 'employer' THEN 'employer'::public.user_role
    ELSE 'candidate'::public.user_role
  END;

  v_full_name := COALESCE(
    NULLIF(TRIM(meta->>'full_name'), ''),
    -- AJOUT : Google renseigne `name` là où notre formulaire renseigne
    -- `full_name`. Sans cette ligne le compte s'appellerait du début de son
    -- adresse email.
    NULLIF(TRIM(meta->>'name'), ''),
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
    user_id, role, full_name, email, phone, neighborhood_id, location,
    -- AJOUT
    onboarding_completed_at
  )
  VALUES (
    NEW.id, v_role, v_full_name, NEW.email, v_phone, v_neighborhood_id, v_location,
    CASE WHEN v_from_form THEN NOW() ELSE NULL END
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

-- ---------------------------------------------------------------------------
-- La colonne rejoint celles que le client ne doit jamais écrire : la poser
-- soi-même reviendrait à sauter l'étape, donc à garder le rôle par défaut.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
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

  NEW.user_id      := OLD.user_id;
  NEW.role         := OLD.role;
  NEW.is_validated := OLD.is_validated;
  NEW.is_premium   := OLD.is_premium;

  NEW.phone_verified_at := OLD.phone_verified_at;
  NEW.phone_otp_pin_id  := OLD.phone_otp_pin_id;

  NEW.onboarding_completed_at := OLD.onboarding_completed_at;

  -- Changer de numéro invalide la vérification précédente : elle portait sur
  -- l'ancien. L'oublier laisserait un profil marqué « vérifié » avec un numéro
  -- que personne n'a jamais confirmé — pire que pas de vérification du tout,
  -- puisque la mention rassure à tort.
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_verified_at := NULL;
    NEW.phone_otp_pin_id  := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Le seul chemin qui écrit le rôle. SECURITY DEFINER pour passer outre le
-- déclencheur ci-dessus, donc les contrôles écrits ici sont la seule barrière.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_onboarding(p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_current public.user_role;
  v_role public.user_role;
BEGIN
  -- Liste blanche explicite : sans elle, 'admin' passerait par un simple cast
  -- et n'importe quel compte Google se ferait modérateur.
  v_role := CASE p_role
    WHEN 'employer' THEN 'employer'::public.user_role
    WHEN 'candidate' THEN 'candidate'::public.user_role
    ELSE NULL
  END;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Rôle inconnu.' USING ERRCODE = '22023';
  END IF;

  -- Une seule fois : la condition sur onboarding_completed_at est ce qui
  -- empêche d'en faire un changement de rôle permanent, avec les candidatures
  -- et les offres d'un ancien rôle restées derrière.
  SELECT id, role INTO v_profile_id, v_current
    FROM public.profiles
   WHERE user_id = auth.uid()
     AND onboarding_completed_at IS NULL
   FOR UPDATE;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Inscription déjà terminée.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET role = v_role,
         onboarding_completed_at = NOW()
   WHERE id = v_profile_id;

  -- Le déclencheur d'inscription a créé la fiche du rôle par défaut. Basculer
  -- sans corriger laisserait un employeur avec une fiche candidat vide, que la
  -- recherche remonterait comme une candidate sans nom.
  IF v_role IS DISTINCT FROM v_current THEN
    IF v_role = 'employer' THEN
      DELETE FROM public.candidate_details WHERE profile_id = v_profile_id;
      INSERT INTO public.employer_details (profile_id) VALUES (v_profile_id)
        ON CONFLICT (profile_id) DO NOTHING;
    ELSE
      DELETE FROM public.employer_details WHERE profile_id = v_profile_id;
      INSERT INTO public.candidate_details (profile_id) VALUES (v_profile_id)
        ON CONFLICT (profile_id) DO NOTHING;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(TEXT) TO authenticated, service_role;
