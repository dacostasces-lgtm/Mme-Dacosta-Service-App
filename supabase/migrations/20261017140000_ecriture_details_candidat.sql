-- Enregistrer son profil candidat sans rouvrir la lecture de la table.
--
-- 20261017110000 a retiré le SELECT de table sur `candidate_details` au profit
-- de droits colonne par colonne, pour que l'âge, le sexe et le CV ne soient plus
-- lisibles par un accès direct. Conséquence non vue : le formulaire de profil
-- enregistrait par un `upsert`, soit un `INSERT … ON CONFLICT DO UPDATE`, et
-- PostgreSQL exige pour cette forme le SELECT sur *toute* la table — les droits
-- par colonne n'y suffisent pas. Son indice le dit mot pour mot :
--   « Grant the required privileges to the current role with:
--     GRANT SELECT ON public.candidate_details TO authenticated; »
-- ce qui annulerait précisément ce que la migration cherchait.
--
-- L'écriture passe donc par une fonction, qui fait l'UPDATE et ne tente l'INSERT
-- que si aucune ligne n'a répondu. Ni l'un ni l'autre ne réclame le SELECT de
-- table.
--
-- `SECURITY INVOKER`, et c'est le point important : en `DEFINER` la fonction
-- tournerait sous son propriétaire, et `reject_phone_numbers` — qui s'exempte
-- sur `current_user IN ('postgres', 'service_role', 'supabase_admin')` — ne
-- mordrait plus. Le filtre anti-numéros posé en 20261017100000 serait contourné
-- par la porte qu'on vient d'ouvrir. En `INVOKER`, la fonction tourne sous
-- `authenticated` : RLS s'applique ligne par ligne et les déclencheurs
-- continuent de contrôler ce qui est écrit.

CREATE OR REPLACE FUNCTION public.save_my_candidate_details(
  p_job_title      TEXT,
  p_age            INTEGER,
  p_gender         TEXT,
  p_experience     TEXT,
  p_desired_salary INTEGER,
  p_availability   TEXT,
  p_languages      JSONB,
  p_skills         JSONB,
  p_work_days      TEXT[],
  p_start_time     TEXT,
  p_end_time       TEXT,
  p_live_in        BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id    UUID := public.current_profile_id();
  v_availability  public.availability_type := NULLIF(p_availability, '')::public.availability_type;
  v_start         TIME := NULLIF(p_start_time, '')::TIME;
  v_end           TIME := NULLIF(p_end_time, '')::TIME;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.';
  END IF;

  -- `description` n'est pas touchée : le champ a été retiré du formulaire, et
  -- l'écrire ici effacerait à chaque enregistrement celles déjà saisies.
  UPDATE public.candidate_details SET
    job_title      = p_job_title,
    age            = p_age,
    gender         = p_gender,
    experience     = p_experience,
    desired_salary = p_desired_salary,
    availability   = v_availability,
    languages      = p_languages,
    skills         = p_skills,
    work_days      = p_work_days,
    start_time     = v_start,
    end_time       = v_end,
    live_in        = p_live_in
  WHERE profile_id = v_profile_id;

  IF NOT FOUND THEN
    INSERT INTO public.candidate_details (
      profile_id, job_title, age, gender, experience, desired_salary,
      availability, languages, skills, work_days, start_time, end_time, live_in
    ) VALUES (
      v_profile_id, p_job_title, p_age, p_gender, p_experience, p_desired_salary,
      v_availability, p_languages, p_skills, p_work_days, v_start, v_end, p_live_in
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_candidate_details(
  TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, JSONB, JSONB, TEXT[], TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_candidate_details(
  TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, JSONB, JSONB, TEXT[], TEXT, TEXT, BOOLEAN
) TO authenticated, service_role;

-- Le CV s'enregistre à part, et ne doit surtout pas effacer le reste du profil :
-- il arrive par un autre écran, sans les autres champs sous la main.
CREATE OR REPLACE FUNCTION public.save_my_cv(p_cv_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.';
  END IF;

  UPDATE public.candidate_details SET cv_url = p_cv_url WHERE profile_id = v_profile_id;

  IF NOT FOUND THEN
    INSERT INTO public.candidate_details (profile_id, cv_url) VALUES (v_profile_id, p_cv_url);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_cv(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_cv(TEXT) TO authenticated, service_role;
