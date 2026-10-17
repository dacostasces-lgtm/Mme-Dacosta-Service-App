-- L'âge, le sexe, le CV et l'identité des modératrices quittent la lecture
-- publique.
--
-- La politique de lecture de `candidate_details` tenait en une ligne : visible
-- dès que le profil l'est. `get_candidate()` ne renvoie, elle, qu'un sous-
-- ensemble réfléchi — mais lire la table directement par l'API contournait ce
-- tri. Tout y passait : l'âge et le sexe d'une candidate, le chemin de son CV,
-- et l'identifiant de la personne qui a contrôlé ses papiers.
--
-- L'âge et le sexe n'ont pas à être publics sur une place de marché de travail
-- domestique : ce sont précisément les critères sur lesquels on discrimine, et
-- rien dans l'interface ne les affiche. Quant à savoir qui a vérifié tel
-- dossier, cela désigne nommément des personnes à qui l'on pourrait s'en
-- prendre.
--
-- Les droits de colonne valent pour un rôle, pas pour une ligne : on ne peut
-- pas « ouvrir l'âge à son propriétaire » par un GRANT. D'où le même motif que
-- 20260728010000 pour les profils — colonnes publiques ouvertes, le reste par
-- fonction.

REVOKE SELECT ON public.candidate_details FROM anon, authenticated;

GRANT SELECT (
  profile_id, job_title, experience, languages, skills, desired_salary,
  availability, description, work_days, start_time, end_time, live_in,
  identity_checked_at, criminal_record_checked_at, interview_passed_at
) ON public.candidate_details TO anon, authenticated;

-- L'écriture n'est pas touchée : la politique d'UPDATE restreint déjà la ligne
-- à son propriétaire, et `set_candidate_check` reste le seul chemin vers les
-- colonnes de vérification.

/**
 * Sa propre fiche, en entier.
 *
 * L'éditeur de profil a besoin de l'âge, du sexe et du CV pour les pré-remplir.
 * Les lire par la table demanderait de rouvrir ces colonnes à tout le monde.
 */
CREATE OR REPLACE FUNCTION public.my_candidate_details()
RETURNS TABLE (
  job_title      TEXT,
  age            INT,
  gender         TEXT,
  experience     TEXT,
  languages      JSONB,
  skills         JSONB,
  desired_salary INT,
  availability   TEXT,
  description    TEXT,
  cv_url         TEXT,
  work_days      TEXT[],
  start_time     TIME,
  end_time       TIME,
  live_in        BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cd.job_title, cd.age, cd.gender, cd.experience, cd.languages, cd.skills,
         cd.desired_salary, cd.availability::TEXT, cd.description, cd.cv_url,
         COALESCE(cd.work_days, '{}'), cd.start_time, cd.end_time,
         COALESCE(cd.live_in, FALSE)
    FROM public.candidate_details cd
    JOIN public.profiles p ON p.id = cd.profile_id
   WHERE p.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_candidate_details() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_candidate_details() TO authenticated, service_role;

/**
 * L'âge et le sexe, pour la modération seulement.
 *
 * Elle en a besoin pour juger un dossier. La fonction refuse à qui n'est pas
 * administrateur plutôt que de renvoyer vide : une erreur se remarque, un
 * tableau vide se prend pour une absence de données.
 */
CREATE OR REPLACE FUNCTION public.admin_candidate_private(p_ids UUID[])
RETURNS TABLE (profile_id UUID, age INT, gender TEXT)
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
    SELECT cd.profile_id, cd.age, cd.gender
      FROM public.candidate_details cd
     WHERE cd.profile_id = ANY(p_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_candidate_private(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_candidate_private(UUID[]) TO authenticated, service_role;
