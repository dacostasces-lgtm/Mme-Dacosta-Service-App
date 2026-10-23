-- Nouveaux tarifs d'abonnement : 2 500 et 15 000 FCFA.
--
--   Premium Candidat   5 000  ->  2 500
--   Premium Employeur 25 000  -> 15 000
--
-- Le prix est fixé ici, pas dans l'application : depuis 20261012010000,
-- l'insertion directe est révoquée et tout passe par request_subscription().
-- src/lib/subscriptions/plans.ts n'en garde qu'une copie d'affichage, et les
-- deux doivent bouger ensemble — sinon la page annonce un prix et la demande
-- en enregistre un autre.
--
-- Le reste de la grille correspond déjà : 500 FCFA par numéro dans les deux
-- sens (20261011040000, 20261011090000) et 5 000 FCFA par offre publiée.

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
    v_price := 2500;
    IF v_role NOT IN ('candidate', 'admin') THEN
      RAISE EXCEPTION 'Cette offre est réservée aux candidats.' USING ERRCODE = '42501';
    END IF;
  ELSIF p_plan = 'premium_employer' THEN
    v_name := 'Premium Employeur';
    v_price := 15000;
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

-- Les demandes encore ouvertes suivent la baisse. Laisser l'ancien montant
-- ferait réclamer 5 000 à quelqu'un à qui la page annonce désormais 2 500, et
-- la file de validation afficherait deux prix pour la même formule.
--
-- Le prix ne fait que baisser, donc personne n'est lésé. Le seul cas gênant
-- serait un versement de l'ancien montant déjà parti : l'administration le
-- verra alors supérieur au dû, et c'est à elle de trancher — un trop-perçu se
-- rattrape, un sous-perçu réclamé après coup se discute.
UPDATE public.subscriptions
   SET price = CASE plan_name
                 WHEN 'Premium Candidat'  THEN 2500
                 WHEN 'Premium Employeur' THEN 15000
               END
 WHERE status = 'pending_payment'
   AND plan_name IN ('Premium Candidat', 'Premium Employeur')
   AND price <> CASE plan_name
                  WHEN 'Premium Candidat'  THEN 2500
                  WHEN 'Premium Employeur' THEN 15000
                END;
