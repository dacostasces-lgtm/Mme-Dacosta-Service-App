-- Le Premium Candidat rend son numéro gratuit pour les recruteurs.
--
-- C'est ce que promet la grille commerciale : « votre numéro de téléphone est
-- visible gratuitement par tous les recruteurs, sans exception, pour qu'ils
-- puissent vous contacter directement ». Jusqu'ici l'abonnement ne faisait
-- rien de tel — seul le Premium de l'employeur lui ouvrait les numéros, et un
-- recruteur non abonné payait 500 FCFA même pour un candidat Premium.
--
-- Ce que l'abonnement candidat achète devient donc concret : être joignable
-- sans que personne ait à payer pour cela. En contrepartie, ces numéros-là ne
-- rapportent plus de déblocage à l'unité.
--
-- La gratuité s'arrête aux recruteurs. Un visiteur anonyme ou un autre
-- candidat ne voit toujours rien : le numéro resterait sinon ramassable par
-- n'importe qui, ce que tout le reste du schéma s'emploie à empêcher depuis
-- 20261017100000_blocage_numeros_complet.
--
-- `candidat_premium` est distinct de `premium`, qui désigne l'abonnement de
-- celui qui regarde. Les deux montrent le numéro, pour deux raisons opposées,
-- et la fiche l'explique à l'employeur.

CREATE OR REPLACE FUNCTION public.candidate_contact(p_candidate_id UUID)
RETURNS TABLE (
  has_number     BOOLEAN,
  access         TEXT,
  unlock_id      UUID,
  phone          TEXT,
  whatsapp       TEXT,
  phone_verified BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := public.current_profile_id();
  v_role      public.user_role;
  v_candidate public.profiles%ROWTYPE;
  v_unlock    public.candidate_unlocks%ROWTYPE;
  v_access    TEXT := 'none';
BEGIN
  SELECT * INTO v_candidate FROM public.profiles
   WHERE id = p_candidate_id AND role = 'candidate';
  IF v_candidate.id IS NULL THEN
    RETURN;
  END IF;

  -- Même règle que get_candidate() : un profil pas encore publié n'existe que
  -- pour son titulaire et l'administration. IS DISTINCT FROM, et non <> : pour
  -- un visiteur, v_me est NULL, et la comparaison ne doit pas le laisser passer.
  IF NOT v_candidate.is_validated
     AND v_candidate.id IS DISTINCT FROM v_me
     AND NOT public.is_admin() THEN
    RETURN;
  END IF;

  IF v_me IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_me;
    SELECT * INTO v_unlock FROM public.candidate_unlocks
     WHERE employer_id = v_me AND candidate_id = p_candidate_id;

    IF v_me = p_candidate_id THEN
      v_access := 'self';
    ELSIF public.is_admin() THEN
      v_access := 'admin';
    -- Le reste est réservé aux employeurs : un abonnement Premium Candidat
    -- n'ouvre pas le numéro des autres candidats.
    ELSIF v_role = 'employer' THEN
      IF v_unlock.status = 'active' THEN
        v_access := 'unlocked';
      ELSIF EXISTS (
        SELECT 1 FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
         WHERE a.candidate_id = p_candidate_id
           AND j.employer_id = v_me
           AND public.job_is_paid(j.id)
      ) THEN
        v_access := 'applied';
      ELSIF public.has_active_premium(v_me) THEN
        v_access := 'premium';
      -- Avant les états d'attente de paiement, et c'est délibéré : sans cela
      -- un employeur ayant une demande ouverte continuerait de se voir
      -- réclamer 500 FCFA pour un numéro devenu gratuit.
      ELSIF public.has_active_premium(p_candidate_id) THEN
        v_access := 'candidat_premium';
      ELSIF v_unlock.status = 'pending_payment' THEN
        v_access := CASE WHEN v_unlock.payment_declared_at IS NULL THEN 'pending' ELSE 'declared' END;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT
    (v_candidate.phone IS NOT NULL OR v_candidate.whatsapp IS NOT NULL),
    v_access,
    v_unlock.id,
    CASE WHEN v_access IN ('self', 'admin', 'unlocked', 'applied', 'premium', 'candidat_premium')
         THEN v_candidate.phone END,
    CASE WHEN v_access IN ('self', 'admin', 'unlocked', 'applied', 'premium', 'candidat_premium')
         THEN v_candidate.whatsapp END,
    v_candidate.phone_verified_at IS NOT NULL;
END;
$$;

-- Demander à payer un numéro que l'abonnement du candidat rend gratuit n'a
-- plus de sens. La garde vit ici, pas seulement dans l'interface : c'est la
-- fonction qui encaisse, et rien n'empêche de l'appeler directement.
CREATE OR REPLACE FUNCTION public.request_candidate_unlock(p_candidate_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := public.current_profile_id();
  v_candidate public.profiles%ROWTYPE;
  v_id        UUID;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND role = 'employer'
  ) THEN
    RAISE EXCEPTION 'Réservé aux employeurs.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.profiles
   WHERE id = p_candidate_id AND role = 'candidate' AND is_validated;
  IF v_candidate.id IS NULL THEN
    RAISE EXCEPTION 'Ce profil n''est pas disponible.';
  END IF;

  IF v_candidate.phone IS NULL AND v_candidate.whatsapp IS NULL THEN
    RAISE EXCEPTION 'Ce candidat n''a pas renseigné de numéro.';
  END IF;

  -- AJOUT : ne pas ouvrir de demande pour un numéro que l'abonnement du
  -- candidat rend gratuit. Sans cette garde, un employeur pourrait régler 500
  -- FCFA pour ce que candidate_contact() lui montre déjà.
  IF public.has_active_premium(p_candidate_id) THEN
    RAISE EXCEPTION 'Ce numéro est gratuit : ce candidat est abonné Premium.'
      USING ERRCODE = '42501';
  END IF;

  -- Une demande rejetée repart à zéro plutôt que d'en exiger une nouvelle :
  -- la contrainte d'unicité l'interdirait de toute façon.
  INSERT INTO public.candidate_unlocks (employer_id, candidate_id, price)
  VALUES (v_me, p_candidate_id, 500)
  ON CONFLICT (employer_id, candidate_id) DO UPDATE
     SET status              = 'pending_payment',
         payment_reference   = NULL,
         payment_declared_at = NULL
   WHERE public.candidate_unlocks.status = 'rejected'
  RETURNING id INTO v_id;

  -- Déjà demandé, en attente ou actif : on renvoie la ligne existante.
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.candidate_unlocks
     WHERE employer_id = v_me AND candidate_id = p_candidate_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_candidate_unlock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_candidate_unlock(UUID) TO authenticated, service_role;
