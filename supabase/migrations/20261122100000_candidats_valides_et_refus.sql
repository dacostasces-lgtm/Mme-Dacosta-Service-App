-- Seul un candidat publié se présente aux employeurs ; un refusé peut être
-- supprimé.
--
-- Demandé le 22 novembre 2026. Un candidat au profil complet pouvait postuler,
-- payer le numéro d'un employeur ou prendre le Premium avant que la modération
-- ait vérifié son identité ; et les candidatures d'un profil refusé restaient
-- sous les yeux des employeurs. Désormais :
--
--   - postuler, débloquer le numéro d'un employeur et voir les numéros par le
--     Premium demandent un profil publié (`is_validated`) ;
--   - un employeur ne voit que les candidatures des profils publiés. Celles
--     envoyées avant la vérification apparaissent dès la publication ; celles
--     d'un profil refusé, jamais (le refus retire la publication) ;
--   - un profil refusé peut être supprimé définitivement par l'administration,
--     comme une personne supprime son propre compte (20261106100000).
--
-- Les mêmes règles sont dites dans l'application (candidateBlock,
-- src/lib/profile/completeness.ts) ; ici, elles tiennent même pour qui
-- appellerait l'API directement.

-- 1. Le critère, en un seul endroit ---------------------------------------------

-- SECURITY DEFINER : lue depuis des politiques, elle ne dépend ni de la
-- politique de lecture de `profiles` ni de ses droits par colonne.
CREATE OR REPLACE FUNCTION public.candidate_is_published(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_profile_id AND role = 'candidate' AND is_validated
  );
$$;

REVOKE ALL ON FUNCTION public.candidate_is_published(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_is_published(UUID) TO authenticated, service_role;

-- 2. Postuler : un profil publié ------------------------------------------------

DROP POLICY IF EXISTS "Candidates can apply." ON public.applications;
CREATE POLICY "Candidates can apply."
  ON public.applications FOR INSERT
  WITH CHECK (
    candidate_id = public.current_profile_id()
    AND public.candidate_is_published(candidate_id)
  );

-- 3. Ce que voit l'employeur : les candidatures des profils publiés -------------
-- Le candidat voit toujours les siennes, l'administration toutes.

DROP POLICY IF EXISTS "Applications visible to candidate and hiring employer." ON public.applications;
CREATE POLICY "Applications visible to candidate and hiring employer."
  ON public.applications FOR SELECT
  USING (
    candidate_id = public.current_profile_id()
    OR public.is_admin()
    OR (
      job_id IN (SELECT id FROM public.jobs WHERE employer_id = public.current_profile_id())
      AND public.candidate_is_published(candidate_id)
    )
  );

-- Les numéros des candidats d'un employeur : la fonction passe outre les
-- politiques, elle applique donc la même règle elle-même.
CREATE OR REPLACE FUNCTION public.my_applicant_contacts()
RETURNS TABLE (
  application_id UUID,
  job_id         UUID,
  paid           BOOLEAN,
  phone          TEXT,
  whatsapp       TEXT,
  phone_verified BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT a.id AS application_id, j.id AS job_id, public.job_is_paid(j.id) AS paid,
           p.phone, p.whatsapp, p.phone_verified_at IS NOT NULL AS phone_verified
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      -- AJOUT : `AND p.is_validated`, comme la politique de lecture.
      JOIN public.profiles p ON p.id = a.candidate_id AND p.role = 'candidate' AND p.is_validated
     WHERE j.employer_id = public.current_profile_id()
  )
  SELECT application_id, job_id, paid,
         CASE WHEN paid THEN phone END,
         CASE WHEN paid THEN whatsapp END,
         phone_verified
    FROM mine;
$$;

REVOKE ALL ON FUNCTION public.my_applicant_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_applicant_contacts() TO authenticated, service_role;

-- 4. Le numéro d'un employeur : un profil publié ---------------------------------

CREATE OR REPLACE FUNCTION public.request_contact_unlock(p_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := public.current_profile_id();
  v_job   public.jobs%ROWTYPE;
  v_owner public.profiles%ROWTYPE;
  v_id    UUID;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND role = 'candidate'
  ) THEN
    RAISE EXCEPTION 'Réservé aux candidats.' USING ERRCODE = '42501';
  END IF;

  -- AJOUT : pas de numéro d'employeur avant la vérification du profil.
  IF NOT public.candidate_is_published(v_me) THEN
    RAISE EXCEPTION 'Votre profil doit d''abord être vérifié par notre équipe.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job FROM public.jobs
   WHERE id = p_job_id AND status = 'active' AND expires_at > NOW();
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Cette offre n''est plus disponible.';
  END IF;

  SELECT * INTO v_owner FROM public.profiles WHERE id = v_job.employer_id;
  IF v_owner.phone IS NULL AND v_owner.whatsapp IS NULL THEN
    RAISE EXCEPTION 'Cet employeur n''a pas renseigné de numéro : contactez-le par la messagerie.';
  END IF;

  -- Une demande rejetée repart à zéro plutôt que d'en exiger une nouvelle :
  -- la contrainte d'unicité l'interdirait de toute façon.
  INSERT INTO public.contact_unlocks (candidate_id, job_id, price)
  VALUES (v_me, p_job_id, 500)
  ON CONFLICT (candidate_id, job_id) DO UPDATE
     SET status              = 'pending_payment',
         payment_reference   = NULL,
         payment_declared_at = NULL
   WHERE public.contact_unlocks.status = 'rejected'
  RETURNING id INTO v_id;

  -- Déjà demandé, en attente ou actif : on renvoie la ligne existante.
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.contact_unlocks
     WHERE candidate_id = v_me AND job_id = p_job_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_contact_unlock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_contact_unlock(UUID) TO authenticated, service_role;

-- Le Premium d'un candidat n'ouvre les numéros qu'une fois son profil publié.
-- Un numéro déjà payé à l'unité reste à lui : il l'a acheté.
CREATE OR REPLACE FUNCTION public.job_contact(p_job_id UUID)
RETURNS TABLE (
  has_number BOOLEAN,
  access     TEXT,
  unlock_id  UUID,
  full_name  TEXT,
  phone      TEXT,
  whatsapp   TEXT,
  phone_verified BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := public.current_profile_id();
  v_job    public.jobs%ROWTYPE;
  v_owner  public.profiles%ROWTYPE;
  v_unlock public.contact_unlocks%ROWTYPE;
  v_access TEXT := 'none';
  v_open   BOOLEAN;
  -- AJOUT
  v_role   public.user_role;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  v_open := v_job.status = 'active' AND v_job.expires_at > NOW();

  -- Une offre fermée ou échue n'est plus publique : seuls son employeur,
  -- l'administration et un candidat qui avait déjà payé la voient encore.
  SELECT * INTO v_owner FROM public.profiles WHERE id = v_job.employer_id;

  IF v_me IS NOT NULL THEN
    SELECT * INTO v_unlock FROM public.contact_unlocks
     WHERE job_id = p_job_id AND candidate_id = v_me;
    -- AJOUT
    SELECT role INTO v_role FROM public.profiles WHERE id = v_me;

    IF v_me = v_job.employer_id THEN
      v_access := 'owner';
    ELSIF public.is_admin() THEN
      v_access := 'admin';
    ELSIF v_unlock.status = 'active' THEN
      v_access := 'unlocked';
    -- AJOUT : la condition sur le profil publié, pour un candidat.
    ELSIF v_open AND public.has_active_premium(v_me)
          AND (v_role IS DISTINCT FROM 'candidate' OR public.candidate_is_published(v_me)) THEN
      v_access := 'premium';
    ELSIF v_unlock.status = 'pending_payment' THEN
      v_access := CASE WHEN v_unlock.payment_declared_at IS NULL THEN 'pending' ELSE 'declared' END;
    END IF;
  END IF;

  IF NOT v_open AND v_access IN ('none', 'pending', 'declared') THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT
    (v_owner.phone IS NOT NULL OR v_owner.whatsapp IS NOT NULL),
    v_access,
    v_unlock.id,
    CASE WHEN v_access IN ('owner', 'admin', 'unlocked', 'premium') THEN v_owner.full_name END,
    CASE WHEN v_access IN ('owner', 'admin', 'unlocked', 'premium') THEN v_owner.phone END,
    CASE WHEN v_access IN ('owner', 'admin', 'unlocked', 'premium') THEN v_owner.whatsapp END,
    v_owner.phone_verified_at IS NOT NULL;
END;
$$;

-- 5. Supprimer un profil refusé -------------------------------------------------
-- L'effacement de 20261106100000, sorti de delete_my_account() pour servir aussi
-- à l'administration. Même principe : le profil reste, vidé et marqué
-- `deleted_at`, parce que des paiements y renvoient.

CREATE OR REPLACE FUNCTION public.erase_profile(p_profile UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Ce qui ne regarde que la personne.
  DELETE FROM public.candidate_details   WHERE profile_id = p_profile;
  DELETE FROM public.candidate_addresses WHERE profile_id = p_profile;
  DELETE FROM public.candidate_documents WHERE profile_id = p_profile;
  DELETE FROM public.employer_details    WHERE profile_id = p_profile;
  DELETE FROM public.profile_rejections  WHERE profile_id = p_profile;
  DELETE FROM public.applications        WHERE candidate_id = p_profile;
  -- La politique les garde « tant que les deux comptes existent ».
  DELETE FROM public.messages WHERE sender_id = p_profile OR receiver_id = p_profile;
  -- Les avis reçus portaient sur elle ; ceux qu'elle a laissés restent, signés
  -- « Compte supprimé » : ils parlent du travail de quelqu'un d'autre.
  DELETE FROM public.reviews WHERE reviewee_id = p_profile;

  -- Ses offres sortent de la liste sans disparaître : des paiements y sont
  -- rattachés (offres payantes, numéros débloqués par des candidats).
  UPDATE public.jobs SET status = 'closed' WHERE employer_id = p_profile AND status = 'active';

  UPDATE public.profiles SET
    full_name         = 'Compte supprimé',
    phone             = NULL,
    whatsapp          = NULL,
    email             = NULL,
    avatar_url        = NULL,
    neighborhood_id   = NULL,
    location          = NULL,
    is_validated      = FALSE,
    is_premium        = FALSE,
    phone_verified_at = NULL,
    phone_otp_pin_id  = NULL,
    deleted_at        = COALESCE(deleted_at, NOW()),
    updated_at        = NOW()
  WHERE id = p_profile;
END;
$$;

-- Personne ne l'appelle directement : elle efface n'importe quel profil. Seules
-- les deux fonctions ci-dessous, qui vérifient qui demande quoi, y mènent.
REVOKE ALL ON FUNCTION public.erase_profile(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_profile(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile UUID := public.current_profile_id();
  v_role    public.user_role;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = 'P0002';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_profile;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Un compte administrateur ne se supprime pas depuis l''application.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.erase_profile(v_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated, service_role;

-- Par l'administration, et seulement un profil refusé : le bouton n'existe que
-- dans « Refusés », et la fonction ne doit pas pouvoir effacer quelqu'un d'autre
-- par erreur. Rend le compte de connexion, que le serveur ferme ensuite.
CREATE OR REPLACE FUNCTION public.delete_refused_profile(p_profile_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profile_rejections WHERE profile_id = p_profile_id) THEN
    RAISE EXCEPTION 'Seul un profil refusé peut être supprimé ici.' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_user FROM public.profiles
   WHERE id = p_profile_id AND role <> 'admin';
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.erase_profile(p_profile_id);
  RETURN v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_refused_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_refused_profile(UUID) TO authenticated, service_role;
