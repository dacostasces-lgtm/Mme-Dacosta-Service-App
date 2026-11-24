-- Offres d'emploi à l'international, publiées par l'administration.
--
-- Demandé le 24 novembre 2026 : Madame Dacosta Services place aussi du
-- personnel à l'étranger. Ces offres :
--   - ne se publient que par l'administration, gratuitement ;
--   - portent un pays (et une ville) de destination au lieu d'un quartier, et
--     un salaire écrit librement (« 1 200 € par mois, logé nourri ») ;
--   - se postulent avec le CV du profil et deux références — des personnes à
--     joindre, avec leur téléphone et leur e-mail — que seule l'administration
--     lit ;
--   - n'ont pas de numéro d'employeur à débloquer : c'est l'agence qui place.
--
-- Comme toute candidature depuis 20261122100000, seul un candidat publié
-- postule.

-- 1. L'offre ---------------------------------------------------------------------

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS is_international     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS destination_country  TEXT,
  ADD COLUMN IF NOT EXISTS destination_city     TEXT,
  ADD COLUMN IF NOT EXISTS salary_text          TEXT;

DO $$
BEGIN
  ALTER TABLE public.jobs ADD CONSTRAINT jobs_international_fields CHECK (
    (destination_country IS NULL OR char_length(destination_country) <= 80)
    AND (destination_city IS NULL OR char_length(destination_city) <= 80)
    AND (salary_text IS NULL OR char_length(salary_text) <= 160)
    AND (NOT is_international OR char_length(btrim(coalesce(destination_country, ''))) >= 2)
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- L'administration seule publie (ou transforme) une offre internationale : un
-- employeur qui l'écrirait par l'API vendrait un placement à l'étranger au nom
-- de l'agence.
CREATE OR REPLACE FUNCTION public.guard_international_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_international
     AND (TG_OP = 'INSERT' OR NOT OLD.is_international)
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seule l''administration publie une offre à l''international.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_international_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_international_job ON public.jobs;
CREATE TRIGGER guard_international_job
  BEFORE INSERT OR UPDATE OF is_international ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_international_job();

-- 2. Les références d'une candidature --------------------------------------------

CREATE TABLE IF NOT EXISTS public.application_references (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  position       SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 2),
  full_name      TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  -- Qui est cette personne pour le candidat : ancienne employeuse, pasteur…
  relation       TEXT NOT NULL CHECK (char_length(btrim(relation)) BETWEEN 2 AND 120),
  -- Écrit librement : une référence peut vivre à l'étranger, et son numéro
  -- n'a pas la forme congolaise.
  phone          TEXT NOT NULL CHECK (char_length(btrim(phone)) BETWEEN 6 AND 32),
  email          TEXT NOT NULL CHECK (
                   char_length(email) <= 254 AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                 ),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, position)
);

ALTER TABLE public.application_references ENABLE ROW LEVEL SECURITY;

-- Lues par le candidat qui les a données et par l'administration, personne
-- d'autre : ce sont les coordonnées de tiers.
DROP POLICY IF EXISTS "Références lues par le candidat et l'administration." ON public.application_references;
CREATE POLICY "Références lues par le candidat et l'administration."
  ON public.application_references FOR SELECT
  USING (
    public.is_admin()
    OR application_id IN (
      SELECT id FROM public.applications WHERE candidate_id = public.current_profile_id()
    )
  );

DROP POLICY IF EXISTS "Références données avec sa propre candidature." ON public.application_references;
CREATE POLICY "Références données avec sa propre candidature."
  ON public.application_references FOR INSERT
  WITH CHECK (
    application_id IN (
      SELECT id FROM public.applications WHERE candidate_id = public.current_profile_id()
    )
  );

-- Ni modification ni suppression directes : retirer sa candidature emporte ses
-- références (ON DELETE CASCADE).
REVOKE ALL ON public.application_references FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.application_references TO authenticated;
GRANT ALL ON public.application_references TO service_role;

-- 3. Une candidature internationale est complète, ou n'est pas -------------------
-- Vérifié à la validation de la transaction, quel que soit le chemin : une
-- candidature écrite directement dans la table, sans ses deux références ni
-- CV, est refusée. postuler_international() écrit tout dans la même
-- transaction, et passe.

CREATE OR REPLACE FUNCTION public.check_international_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = NEW.job_id AND is_international) THEN
    RETURN NULL;
  END IF;
  -- La candidature a pu être retirée dans la même transaction.
  IF NOT EXISTS (SELECT 1 FROM public.applications WHERE id = NEW.id) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.candidate_details
     WHERE profile_id = NEW.candidate_id AND coalesce(btrim(cv_url), '') <> ''
  ) THEN
    RAISE EXCEPTION 'Ajoutez d''abord votre CV à votre profil.' USING ERRCODE = '23514';
  END IF;

  IF (SELECT count(*) FROM public.application_references WHERE application_id = NEW.id) < 2 THEN
    RAISE EXCEPTION 'Deux références sont nécessaires pour une offre à l''international.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.check_international_application() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS check_international_application ON public.applications;
CREATE CONSTRAINT TRIGGER check_international_application
  AFTER INSERT ON public.applications
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_international_application();

-- 4. Postuler à une offre internationale -----------------------------------------
-- En une transaction : la candidature puis ses deux références. Avec les droits
-- du candidat (SECURITY INVOKER) : la politique d'insertion des candidatures
-- (profil publié) et le filtre anti-numéros du message s'appliquent comme
-- ailleurs.

CREATE OR REPLACE FUNCTION public.postuler_international(
  p_job_id     UUID,
  p_message    TEXT,
  p_references JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me          UUID := public.current_profile_id();
  v_application UUID;
  v_ref         JSONB;
  v_position    INT := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs
     WHERE id = p_job_id AND is_international AND status = 'active' AND expires_at > NOW()
  ) THEN
    RAISE EXCEPTION 'Cette offre n''est plus ouverte aux candidatures.';
  END IF;

  IF jsonb_typeof(p_references) IS DISTINCT FROM 'array' OR jsonb_array_length(p_references) <> 2 THEN
    RAISE EXCEPTION 'Deux références sont nécessaires pour une offre à l''international.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.applications (job_id, candidate_id, message)
  VALUES (p_job_id, v_me, NULLIF(btrim(coalesce(p_message, '')), ''))
  RETURNING id INTO v_application;

  FOR v_ref IN SELECT value FROM jsonb_array_elements(p_references) LOOP
    v_position := v_position + 1;
    INSERT INTO public.application_references (application_id, position, full_name, relation, phone, email)
    VALUES (
      v_application,
      v_position,
      btrim(v_ref->>'full_name'),
      btrim(v_ref->>'relation'),
      btrim(v_ref->>'phone'),
      lower(btrim(v_ref->>'email'))
    );
  END LOOP;

  RETURN v_application;
END;
$$;

REVOKE ALL ON FUNCTION public.postuler_international(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.postuler_international(UUID, TEXT, JSONB) TO authenticated, service_role;

-- 5. Le CV d'un candidat, pour l'administration ----------------------------------
-- La colonne n'est plus lisible directement depuis 20261017110000. Le chemin,
-- à son titulaire et à l'administration ; le lien signé se fait ensuite avec la
-- session, que la politique du seau `cvs` laisse passer pour eux seuls.

CREATE OR REPLACE FUNCTION public.candidate_cv_path(p_profile_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT cd.cv_url
    FROM public.candidate_details cd
   WHERE cd.profile_id = p_profile_id
     AND (public.is_admin() OR p_profile_id = public.current_profile_id());
$$;

REVOKE ALL ON FUNCTION public.candidate_cv_path(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_cv_path(UUID) TO authenticated, service_role;

-- 6. Pas de numéro d'employeur à débloquer sur une offre internationale ----------
-- L'employeur, c'est l'agence : son numéro ne se vend pas, et le Premium ne
-- l'ouvre pas non plus.

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

  -- Pas de numéro d'employeur avant la vérification du profil (20261122100000).
  IF NOT public.candidate_is_published(v_me) THEN
    RAISE EXCEPTION 'Votre profil doit d''abord être vérifié par notre équipe.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job FROM public.jobs
   WHERE id = p_job_id AND status = 'active' AND expires_at > NOW();
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Cette offre n''est plus disponible.';
  END IF;

  -- AJOUT : une offre internationale se postule avec un dossier.
  IF v_job.is_international THEN
    RAISE EXCEPTION 'Cette offre à l''international se postule avec votre CV et vos références.';
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
    SELECT role INTO v_role FROM public.profiles WHERE id = v_me;

    IF v_me = v_job.employer_id THEN
      v_access := 'owner';
    ELSIF public.is_admin() THEN
      v_access := 'admin';
    ELSIF v_unlock.status = 'active' THEN
      v_access := 'unlocked';
    -- Le Premium d'un candidat n'ouvre les numéros qu'une fois son profil
    -- publié (20261122100000).
    ELSIF v_open AND public.has_active_premium(v_me)
          AND (v_role IS DISTINCT FROM 'candidate' OR public.candidate_is_published(v_me)) THEN
      v_access := 'premium';
    ELSIF v_unlock.status = 'pending_payment' THEN
      v_access := CASE WHEN v_unlock.payment_declared_at IS NULL THEN 'pending' ELSE 'declared' END;
    END IF;
  END IF;

  -- AJOUT : sur une offre internationale, le numéro de l'agence ne se montre
  -- qu'à elle-même.
  IF v_job.is_international AND v_access NOT IN ('owner', 'admin') THEN
    RETURN;
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
