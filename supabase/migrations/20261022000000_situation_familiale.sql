-- L'âge et la situation familiale des candidats, montrés aux familles qui
-- recrutent.
--
-- Pour une nounou ou une ménagère, les familles demandent l'âge, la situation
-- matrimoniale et les enfants — c'est ce que l'agence demande déjà en
-- entretien. Ces informations entrent dans le profil (cases obligatoires) et
-- s'affichent sur la fiche.
--
-- Mais pas au premier venu. 20261017110000 a retiré l'âge et le sexe de la
-- lecture publique, parce que la fiche se lit sans compte et que ce sont des
-- critères sur lesquels on discrimine. Les nouvelles colonnes restent donc
-- hors des droits de lecture par colonne (aucun GRANT SELECT ci-dessous), et
-- ne sortent que par candidate_situation() : pour un employeur connecté,
-- l'administration, ou la candidate elle-même.

ALTER TABLE public.candidate_details
  ADD COLUMN IF NOT EXISTS marital_status     TEXT,
  ADD COLUMN IF NOT EXISTS children_count     SMALLINT,
  ADD COLUMN IF NOT EXISTS youngest_child_age SMALLINT;

-- Nommées, et retirées avant d'être reposées : la migration se rejoue.
ALTER TABLE public.candidate_details
  DROP CONSTRAINT IF EXISTS candidate_details_marital_status_valide,
  DROP CONSTRAINT IF EXISTS candidate_details_children_count_valide,
  DROP CONSTRAINT IF EXISTS candidate_details_youngest_child_age_valide;

ALTER TABLE public.candidate_details
  ADD CONSTRAINT candidate_details_marital_status_valide CHECK (
    marital_status IS NULL
    OR marital_status IN ('celibataire', 'marie', 'union_libre', 'divorce', 'separe', 'veuf')
  ),
  ADD CONSTRAINT candidate_details_children_count_valide CHECK (
    children_count IS NULL OR children_count BETWEEN 0 AND 20
  ),
  -- L'âge du dernier enfant n'a de sens qu'avec au moins un enfant.
  ADD CONSTRAINT candidate_details_youngest_child_age_valide CHECK (
    youngest_child_age IS NULL
    OR (youngest_child_age BETWEEN 0 AND 60 AND children_count > 0)
  );

-- Enregistrer sa situation --------------------------------------------------
-- À part de save_my_candidate_details(), pour ne pas changer sa signature :
-- l'application déjà en ligne continue de l'appeler telle quelle pendant que
-- cette migration passe. `SECURITY INVOKER` pour la même raison qu'elle :
-- RLS et les déclencheurs gardent la main (20261017140000).
CREATE OR REPLACE FUNCTION public.save_my_family_situation(
  p_marital_status     TEXT,
  p_children_count     INTEGER,
  p_youngest_child_age INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
  -- Sans enfant, pas d'âge de dernier enfant, quoi qu'envoie le formulaire.
  v_youngest   INTEGER := CASE WHEN COALESCE(p_children_count, 0) > 0
                               THEN p_youngest_child_age END;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.';
  END IF;

  UPDATE public.candidate_details SET
    marital_status     = NULLIF(p_marital_status, ''),
    children_count     = p_children_count,
    youngest_child_age = v_youngest
  WHERE profile_id = v_profile_id;

  IF NOT FOUND THEN
    INSERT INTO public.candidate_details (
      profile_id, marital_status, children_count, youngest_child_age
    ) VALUES (
      v_profile_id, NULLIF(p_marital_status, ''), p_children_count, v_youngest
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_family_situation(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_family_situation(TEXT, INTEGER, INTEGER)
  TO authenticated, service_role;

-- Relire sa propre fiche, situation comprise ----------------------------------
-- Le type de retour change : DROP puis CREATE, et les droits sont reposés.
DROP FUNCTION IF EXISTS public.my_candidate_details();

CREATE FUNCTION public.my_candidate_details()
RETURNS TABLE (
  job_title          TEXT,
  age                INT,
  gender             TEXT,
  experience         TEXT,
  languages          JSONB,
  skills             JSONB,
  desired_salary     INT,
  availability       TEXT,
  description        TEXT,
  cv_url             TEXT,
  work_days          TEXT[],
  start_time         TIME,
  end_time           TIME,
  live_in            BOOLEAN,
  marital_status     TEXT,
  children_count     INT,
  youngest_child_age INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cd.job_title, cd.age, cd.gender, cd.experience, cd.languages, cd.skills,
         cd.desired_salary, cd.availability::TEXT, cd.description, cd.cv_url,
         COALESCE(cd.work_days, '{}'), cd.start_time, cd.end_time,
         COALESCE(cd.live_in, FALSE),
         cd.marital_status, cd.children_count::INT, cd.youngest_child_age::INT
    FROM public.candidate_details cd
    JOIN public.profiles p ON p.id = cd.profile_id
   WHERE p.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_candidate_details() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_candidate_details() TO authenticated, service_role;

-- La modération, pour juger un dossier complet --------------------------------
DROP FUNCTION IF EXISTS public.admin_candidate_private(UUID[]);

CREATE FUNCTION public.admin_candidate_private(p_ids UUID[])
RETURNS TABLE (
  profile_id         UUID,
  age                INT,
  gender             TEXT,
  marital_status     TEXT,
  children_count     INT,
  youngest_child_age INT
)
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
    SELECT cd.profile_id, cd.age, cd.gender, cd.marital_status,
           cd.children_count::INT, cd.youngest_child_age::INT
      FROM public.candidate_details cd
     WHERE cd.profile_id = ANY(p_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_candidate_private(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_candidate_private(UUID[]) TO authenticated, service_role;

-- Ce que voit la famille qui recrute -------------------------------------------
-- L'âge et la situation familiale d'une candidate publiée, pour un employeur
-- connecté ou l'administration ; sa propre fiche pour la candidate. Un
-- visiteur, ou une autre candidate, ne reçoit rien — pas même une erreur, la
-- fiche affiche alors simplement de quoi se connecter.
CREATE OR REPLACE FUNCTION public.candidate_situation(p_candidate_id UUID)
RETURNS TABLE (
  age                INT,
  marital_status     TEXT,
  children_count     INT,
  youngest_child_age INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := public.current_profile_id();
  v_role public.user_role;
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_me;
  IF NOT (v_me = p_candidate_id OR v_role IN ('employer', 'admin')) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT cd.age, cd.marital_status, cd.children_count::INT, cd.youngest_child_age::INT
      FROM public.candidate_details cd
      JOIN public.profiles p ON p.id = cd.profile_id
     WHERE cd.profile_id = p_candidate_id
       AND p.role = 'candidate'
       -- Même règle que get_candidate() : un profil pas encore publié n'existe
       -- que pour son titulaire et l'administration.
       AND (p.is_validated OR p.id = v_me OR v_role = 'admin');
END;
$$;

REVOKE ALL ON FUNCTION public.candidate_situation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_situation(UUID) TO authenticated, service_role;
