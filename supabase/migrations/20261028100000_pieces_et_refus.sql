-- Pièces justificatives des candidats, et refus d'un profil par la modération.
--
-- 1. Pièce d'identité (recto et verso, une seule page pour un passeport) et
--    permis de conduire pour les chauffeurs. L'agence vérifie l'identité avant
--    de publier ; ces documents ne se montrent qu'à leur titulaire et à
--    l'administration, jamais aux familles ni au public.
-- 2. Un profil que la modération écarte sort de la file « En attente » sans
--    être supprimé : il se remet en attente d'un geste. Le candidat voit qu'il
--    n'a pas été retenu, avec le motif s'il y en a un.

-- 1. Pièces -------------------------------------------------------------------

-- Seau privé, comme celui des CV (20260728030000) : rien ne s'y liste, un
-- fichier ne sort que par un lien signé de courte durée. 10 Mo : une photo
-- prise au téléphone, pas toujours compressée, doit rester lisible.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pieces', 'pieces', FALSE, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Chemins `<auth.uid()>/<fichier>`, comme pour les autres seaux : le premier
-- dossier est celui du titulaire, ce qui empêche d'écrire chez un autre.
-- L'administration dépose aussi, pour un candidat rencontré hors ligne et
-- saisi par « Ajouter un candidat » : elle a ses pièces sous les yeux.
DROP POLICY IF EXISTS "Pièces lisibles par leur titulaire et l'administration." ON storage.objects;
CREATE POLICY "Pièces lisibles par leur titulaire et l'administration."
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pieces'
    AND ((storage.foldername(name))[1] = auth.uid()::TEXT OR public.is_admin())
  );

DROP POLICY IF EXISTS "Le titulaire envoie ses pièces." ON storage.objects;
CREATE POLICY "Le titulaire envoie ses pièces."
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pieces'
    AND ((storage.foldername(name))[1] = auth.uid()::TEXT OR public.is_admin())
  );

DROP POLICY IF EXISTS "Le titulaire remplace ses pièces." ON storage.objects;
CREATE POLICY "Le titulaire remplace ses pièces."
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pieces'
    AND ((storage.foldername(name))[1] = auth.uid()::TEXT OR public.is_admin())
  );

DROP POLICY IF EXISTS "Le titulaire retire ses pièces." ON storage.objects;
CREATE POLICY "Le titulaire retire ses pièces."
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pieces'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- Où sont rangées les pièces d'un candidat. Une table à elle, comme l'adresse
-- précise (20261012000000) : `candidate_details` se lit par tout le monde
-- pour un profil publié.
CREATE TABLE IF NOT EXISTS public.candidate_documents (
  profile_id      UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  identity_type   TEXT CHECK (
    identity_type IN ('cni', 'passeport', 'carte_sejour', 'carte_consulaire')
  ),
  -- Chemins dans le seau `pieces`, pas des liens : un lien signé expire.
  identity_front  TEXT,
  identity_back   TEXT,
  driving_license TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pièces visibles de leur titulaire et de l'administration." ON public.candidate_documents;
CREATE POLICY "Pièces visibles de leur titulaire et de l'administration."
  ON public.candidate_documents FOR SELECT
  USING (profile_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Le titulaire enregistre ses pièces." ON public.candidate_documents;
CREATE POLICY "Le titulaire enregistre ses pièces."
  ON public.candidate_documents FOR INSERT
  WITH CHECK (profile_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Le titulaire met à jour ses pièces." ON public.candidate_documents;
CREATE POLICY "Le titulaire met à jour ses pièces."
  ON public.candidate_documents FOR UPDATE
  USING (profile_id = public.current_profile_id() OR public.is_admin())
  WITH CHECK (profile_id = public.current_profile_id() OR public.is_admin());

-- La base hébergée accorde tout par défaut sur une nouvelle table : rien pour
-- un visiteur, et pas de suppression depuis l'application — une pièce se
-- remplace.
REVOKE ALL ON public.candidate_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.candidate_documents TO authenticated;
GRANT ALL ON public.candidate_documents TO service_role;

-- Un chemin doit être dans le dossier du titulaire. Sans cela, écrire
-- directement par l'API le chemin d'un autre ferait montrer à la modération la
-- pièce de quelqu'un d'autre sous ce nom-ci.
CREATE OR REPLACE FUNCTION public.check_candidate_documents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_folder TEXT;
BEGIN
  SELECT user_id::TEXT INTO v_folder FROM public.profiles WHERE id = NEW.profile_id;

  IF v_folder IS NULL
     OR (NEW.identity_front  IS NOT NULL AND split_part(NEW.identity_front,  '/', 1) <> v_folder)
     OR (NEW.identity_back   IS NOT NULL AND split_part(NEW.identity_back,   '/', 1) <> v_folder)
     OR (NEW.driving_license IS NOT NULL AND split_part(NEW.driving_license, '/', 1) <> v_folder)
  THEN
    RAISE EXCEPTION 'Pièce refusée : le fichier n''appartient pas à ce profil.'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_candidate_documents() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS check_candidate_documents ON public.candidate_documents;
CREATE TRIGGER check_candidate_documents
  BEFORE INSERT OR UPDATE ON public.candidate_documents
  FOR EACH ROW EXECUTE FUNCTION public.check_candidate_documents();

-- 2. Refus ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profile_rejections (
  profile_id  UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason      TEXT CHECK (reason IS NULL OR char_length(reason) <= 300),
  rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profile_rejections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Refus visible du profil concerné et de l'administration." ON public.profile_rejections;
CREATE POLICY "Refus visible du profil concerné et de l'administration."
  ON public.profile_rejections FOR SELECT
  USING (profile_id = public.current_profile_id() OR public.is_admin());

-- Lecture seulement, et sans `rejected_by` : comme pour les vérifications
-- (20261017110000), le nom de la modératrice ne sort pas — c'est désigner
-- quelqu'un à qui s'en prendre. L'écriture passe par les deux fonctions
-- ci-dessous.
REVOKE ALL ON public.profile_rejections FROM PUBLIC, anon, authenticated;
GRANT SELECT (profile_id, reason, rejected_at) ON public.profile_rejections TO authenticated;
GRANT ALL ON public.profile_rejections TO service_role;

-- Écarter un profil de la file. Il cesse aussi d'être en ligne : un profil
-- refusé n'a rien à faire dans la recherche.
CREATE OR REPLACE FUNCTION public.reject_profile(p_profile_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_profile_id AND role <> 'admin'
  ) THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.profile_rejections (profile_id, reason, rejected_by, rejected_at)
  VALUES (p_profile_id, NULLIF(btrim(p_reason), ''), public.current_profile_id(), NOW())
  ON CONFLICT (profile_id) DO UPDATE
    SET reason      = EXCLUDED.reason,
        rejected_by = EXCLUDED.rejected_by,
        rejected_at = EXCLUDED.rejected_at;

  UPDATE public.profiles SET is_validated = FALSE WHERE id = p_profile_id AND is_validated;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_profile(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_profile(UUID, TEXT) TO authenticated, service_role;

-- Le remettre en attente.
CREATE OR REPLACE FUNCTION public.restore_profile(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.profile_rejections WHERE profile_id = p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_profile(UUID) TO authenticated, service_role;
