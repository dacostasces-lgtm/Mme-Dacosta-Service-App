-- Corrections de l'audit de sécurité du 12 octobre 2026 : les failles graves.
--
-- Point commun : l'API Supabase se joue directement avec la clé publique et
-- la session de l'utilisateur. Tout ce qu'une politique ou un droit laisse
-- faire, un compte le peut, quoi que fasse l'interface. Chaque correction
-- ci-dessous ferme une écriture que seule l'interface encadrait.

-- 1. « Numéro confirmé par SMS » ---------------------------------------------
-- Les deux fonctions étaient appelables par tout compte connecté, et la
-- confirmation ne vérifiait que l'identifiant écrit un appel plus tôt par le
-- même compte : start('x') puis confirm('x') marquait le numéro vérifié sans
-- qu'aucun SMS ne parte. Elles ne s'appellent plus que depuis le serveur, avec
-- la clé de service, après qu'Infobip a validé le code.
--
-- start exige en plus que le numéro n'ait pas changé depuis l'envoi : sans
-- cela, changer de numéro pendant l'envoi faisait valider le nouveau avec le
-- code reçu sur l'ancien. Un changement de numéro efface la demande en cours
-- (protect_profile_columns), donc confirm ne peut plus servir l'ancien code.

DROP FUNCTION IF EXISTS public.start_phone_verification(TEXT);
DROP FUNCTION IF EXISTS public.confirm_phone_verification(TEXT);

CREATE OR REPLACE FUNCTION public.start_phone_verification(
  p_profile_id UUID,
  p_phone      TEXT,
  p_pin_id     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET phone_otp_pin_id = p_pin_id
   WHERE id = p_profile_id
     AND phone = p_phone;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Le numéro a changé pendant l''envoi du code : demandez-en un nouveau.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_phone_verification(
  p_profile_id UUID,
  p_pin_id     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET phone_verified_at = NOW(),
         phone_otp_pin_id  = NULL
   WHERE id = p_profile_id
     AND phone_otp_pin_id = p_pin_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucune demande de vérification en cours pour ce profil.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.start_phone_verification(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_phone_verification(UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_phone_verification(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_phone_verification(UUID, TEXT) TO service_role;

-- 2. Candidatures : l'employeur ne change que l'étape --------------------------
-- La politique de mise à jour vérifiait l'offre, pas les colonnes : un
-- employeur avec une offre payée remplaçait `candidate_id` par n'importe quel
-- profil, puis lisait son numéro par my_applicant_contacts().

REVOKE UPDATE ON public.applications FROM anon, authenticated;
GRANT UPDATE (status) ON public.applications TO authenticated;

DROP POLICY IF EXISTS "Hiring employer can update applications." ON public.applications;
CREATE POLICY "Hiring employer can update applications."
  ON public.applications FOR UPDATE
  USING (
    job_id IN (SELECT id FROM public.jobs WHERE employer_id = public.current_profile_id())
    OR public.is_admin()
  )
  WITH CHECK (
    job_id IN (SELECT id FROM public.jobs WHERE employer_id = public.current_profile_id())
    OR public.is_admin()
  );

-- Même si une candidature venait à pointer ailleurs, seuls des candidats.
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
      JOIN public.profiles p ON p.id = a.candidate_id AND p.role = 'candidate'
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

-- 3. Abonnements : prix et formule fixés ici ----------------------------------
-- L'insertion directe laissait l'acheteur choisir `plan_name` et `price` :
-- « Premium Employeur à 100 FCFA », que la file de validation affichait tel
-- quel. La demande passe désormais par request_subscription(), qui fixe le
-- prix et vérifie que la formule correspond au rôle.

REVOKE INSERT ON public.subscriptions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_subscription(p_plan TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := public.current_profile_id();
  v_role  public.user_role;
  v_name  TEXT;
  v_price INT;
  v_id    UUID;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_me;

  -- Les montants de src/lib/subscriptions/plans.ts, qui n'en garde qu'une
  -- copie d'affichage. L'administration peut tester les deux formules.
  IF p_plan = 'premium_candidate' THEN
    v_name := 'Premium Candidat';
    v_price := 5000;
    IF v_role NOT IN ('candidate', 'admin') THEN
      RAISE EXCEPTION 'Cette offre est réservée aux candidats.' USING ERRCODE = '42501';
    END IF;
  ELSIF p_plan = 'premium_employer' THEN
    v_name := 'Premium Employeur';
    v_price := 25000;
    IF v_role NOT IN ('employer', 'admin') THEN
      RAISE EXCEPTION 'Cette offre est réservée aux employeurs.' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Offre inconnue.';
  END IF;

  -- Une seule demande ouverte à la fois : deux lignes pour un même versement
  -- laisseraient l'administration sans moyen de savoir laquelle il règle.
  SELECT id INTO v_id FROM public.subscriptions
   WHERE profile_id = v_me AND status = 'pending_payment'
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.subscriptions (profile_id, plan_name, price, status, is_active)
  VALUES (v_me, v_name, v_price, 'pending_payment', FALSE)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_subscription(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_subscription(TEXT) TO authenticated, service_role;

-- Les demandes en attente déjà faussées : annulées plutôt que présentées à la
-- validation avec un prix choisi par l'acheteur.
UPDATE public.subscriptions
   SET status = 'cancelled'
 WHERE status = 'pending_payment'
   AND NOT (
     (plan_name = 'Premium Candidat'  AND price = 5000) OR
     (plan_name = 'Premium Employeur' AND price = 25000)
   );

-- Premium ne vaut que pour la formule du rôle : un employeur abonné au
-- Premium Candidat (5 000) n'obtient plus les avantages du Premium Employeur
-- (25 000), ni l'inverse. L'administration voit tout par ailleurs.
CREATE OR REPLACE FUNCTION public.has_active_premium(p_profile UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.subscriptions s
      JOIN public.profiles p ON p.id = s.profile_id
     WHERE s.profile_id = p_profile
       AND s.is_active
       AND s.status = 'active'
       AND (s.end_date IS NULL OR s.end_date > NOW())
       AND s.plan_name = CASE p.role
                           WHEN 'candidate' THEN 'Premium Candidat'
                           WHEN 'employer'  THEN 'Premium Employeur'
                         END
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_premium(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_premium(UUID) TO authenticated, service_role;

-- 4. Réservations : rien de payé ni de chiffré à la création -----------------
-- Le garde-fou ne jouait qu'à la mise à jour : à l'insertion, un employeur
-- écrivait `status = 'paid'`, ou `amount = 1` que le relais SMS réglait
-- ensuite contre un versement d'1 FCFA. Désormais l'insertion repart toujours
-- de l'état « à régler », au prix de la plateforme (BOOKING_FEE_XAF).

CREATE OR REPLACE FUNCTION public.guard_new_booking()
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

  -- L'identifiant donne la référence de paiement (MD-XXXXXX) : choisi par le
  -- client, il pouvait copier celle d'une autre réservation.
  NEW.id                   := gen_random_uuid();
  NEW.amount               := 15000;
  NEW.currency             := 'XAF';
  NEW.status               := 'pending_payment';
  NEW.payment_reference    := NULL;
  NEW.payment_declared_at  := NULL;
  NEW.payment_confirmed_at := NULL;
  NEW.payment_confirmed_by := NULL;
  NEW.created_at           := NOW();
  NEW.updated_at           := NOW();

  -- Le profil visé doit être un candidat publié : la RLS de `profiles` cache
  -- les autres, donc la lecture échoue pour eux comme pour un identifiant
  -- inventé.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = NEW.candidate_id AND role = 'candidate' AND is_validated
  ) THEN
    RAISE EXCEPTION 'Ce profil n''est plus disponible à la réservation.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_new_booking ON public.bookings;
CREATE TRIGGER guard_new_booking
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_booking();

-- À la mise à jour, les deux parties sont figées en plus : une réservation
-- payée ne se déplace plus vers un autre candidat.
CREATE OR REPLACE FUNCTION public.protect_booking_payment_columns()
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

  NEW.id                   := OLD.id;
  NEW.employer_id          := OLD.employer_id;
  NEW.candidate_id         := OLD.candidate_id;
  NEW.amount               := OLD.amount;
  NEW.currency             := OLD.currency;
  NEW.payment_reference    := OLD.payment_reference;
  NEW.payment_declared_at  := OLD.payment_declared_at;
  NEW.payment_confirmed_at := OLD.payment_confirmed_at;
  NEW.payment_confirmed_by := OLD.payment_confirmed_by;
  NEW.created_at           := OLD.created_at;

  -- The one transition an employer may make is cancelling their own request.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    NEW.status := OLD.status;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- 5. Position des profils : arrondie à environ un kilomètre ------------------
-- La recherche renvoie la distance au dixième de kilomètre depuis n'importe
-- quel point de départ, et filtre au mètre près sur le rayon : en interrogeant
-- depuis trois points, on retrouvait le domicile d'une candidate à quelques
-- mètres. La position enregistrée est désormais celle d'une grille de 0,01°
-- (environ 1,1 km à Brazzaville) : assez pour trier par proximité, plus assez
-- pour trouver une maison.

CREATE OR REPLACE FUNCTION public.blur_profile_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.location IS NOT NULL THEN
    NEW.location := ST_SnapToGrid(NEW.location::geometry, 0.01)::geography;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blur_profile_location ON public.profiles;
CREATE TRIGGER blur_profile_location
  BEFORE INSERT OR UPDATE OF location ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.blur_profile_location();

-- Les positions déjà enregistrées passent par le même arrondi.
UPDATE public.profiles SET location = location WHERE location IS NOT NULL;
