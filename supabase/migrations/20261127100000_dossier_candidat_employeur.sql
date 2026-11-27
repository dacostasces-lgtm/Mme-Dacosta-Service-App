-- Le dossier complet d'un candidat, pour l'employeur qui a payé.
--
-- Demandé le 26 novembre 2026 : un employeur qui paie ne voyait du candidat
-- que son nom et son numéro ; ni ses pièces d'identité, ni son CV. « S'ils ont
-- payé, c'est pour avoir accès à tout ça. »
--
-- Ouvrent le dossier, comme ils ouvrent déjà le numéro (candidate_contact) :
--   - le numéro de ce candidat débloqué (500 FCFA) ;
--   - une candidature de ce candidat à une offre payante de l'employeur ;
--   - l'abonnement Premium Employeur.
-- Le Premium du candidat rend son numéro gratuit, pas ses pièces : l'employeur
-- n'a alors rien payé.
--
-- L'adresse précise reste à l'administration : le profil la promet « jamais
-- sur votre fiche ».

-- 1. Qui voit le dossier ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_view_candidate_files(p_candidate_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me   UUID := public.current_profile_id();
  v_role public.user_role;
BEGIN
  IF v_me IS NULL THEN
    RETURN FALSE;
  END IF;
  -- Le candidat lui-même, et l'administration.
  IF v_me = p_candidate_id OR public.is_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_me;
  IF v_role IS DISTINCT FROM 'employer' THEN
    RETURN FALSE;
  END IF;
  -- Un profil publié seulement : refusé ou pas encore vérifié, il n'est plus
  -- montré aux employeurs (20261122100000).
  IF NOT public.candidate_is_published(p_candidate_id) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
           SELECT 1 FROM public.candidate_unlocks
            WHERE employer_id = v_me AND candidate_id = p_candidate_id AND status = 'active'
         )
      OR EXISTS (
           SELECT 1 FROM public.applications a
             JOIN public.jobs j ON j.id = a.job_id
            WHERE a.candidate_id = p_candidate_id
              AND j.employer_id = v_me
              AND public.job_is_paid(j.id)
         )
      OR public.has_active_premium(v_me);
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_candidate_files(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_candidate_files(UUID) TO authenticated, service_role;

-- 2. Ce que la fiche montre ------------------------------------------------------
-- Ce qui existe dans le dossier, sans les chemins : la fiche affiche des liens,
-- et chaque lien redemande le fichier (candidate_file_path) au moment du clic.

CREATE OR REPLACE FUNCTION public.candidate_dossier(p_candidate_id UUID)
RETURNS TABLE (
  gender          TEXT,
  identity_type   TEXT,
  identity_front  BOOLEAN,
  identity_back   BOOLEAN,
  driving_license BOOLEAN,
  cv              BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.can_view_candidate_files(p_candidate_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT cd.gender,
           doc.identity_type,
           doc.identity_front IS NOT NULL,
           doc.identity_back IS NOT NULL,
           doc.driving_license IS NOT NULL,
           coalesce(btrim(cd.cv_url), '') <> ''
      FROM public.profiles p
      LEFT JOIN public.candidate_details cd ON cd.profile_id = p.id
      LEFT JOIN public.candidate_documents doc ON doc.profile_id = p.id
     WHERE p.id = p_candidate_id AND p.role = 'candidate';
END;
$$;

REVOKE ALL ON FUNCTION public.candidate_dossier(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_dossier(UUID) TO authenticated, service_role;

-- 3. Le chemin d'un fichier du dossier -------------------------------------------
-- Pour les routes api/pieces et api/cv, qui en font un lien signé d'une minute.
-- Les seaux ne laissent lire que le titulaire et l'administration : pour un
-- employeur, le serveur signe avec la clé de service, après cette vérification.

CREATE OR REPLACE FUNCTION public.candidate_file_path(p_candidate_id UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.can_view_candidate_files(p_candidate_id) THEN
    RETURN NULL;
  END IF;

  RETURN CASE p_kind
    WHEN 'cv' THEN
      (SELECT cv_url FROM public.candidate_details WHERE profile_id = p_candidate_id)
    WHEN 'identity_front' THEN
      (SELECT identity_front FROM public.candidate_documents WHERE profile_id = p_candidate_id)
    WHEN 'identity_back' THEN
      (SELECT identity_back FROM public.candidate_documents WHERE profile_id = p_candidate_id)
    WHEN 'driving_license' THEN
      (SELECT driving_license FROM public.candidate_documents WHERE profile_id = p_candidate_id)
    ELSE NULL
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.candidate_file_path(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_file_path(UUID, TEXT) TO authenticated, service_role;
