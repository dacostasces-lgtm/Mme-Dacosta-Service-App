-- Vérification du numéro de téléphone à l'inscription.
--
-- Le téléphone est le seul canal par lequel un employeur joint une candidate :
-- un numéro erroné rend le profil inutilisable, et personne ne s'en aperçoit
-- avant l'échec d'une mise en relation. La validation de forme posée dans
-- src/lib/phone.ts écarte les saisies absurdes, pas les numéros bien formés qui
-- n'appartiennent à personne.
--
-- Le code lui-même n'est pas stocké ici : sa génération, son expiration et le
-- comptage des tentatives sont délégués à l'API 2FA d'Infobip. On ne conserve
-- que l'identifiant opaque de la demande en cours, le temps de la rapprocher de
-- la vérification qui suit.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_otp_pin_id TEXT;

COMMENT ON COLUMN public.profiles.phone_verified_at IS
  'Horodatage de la dernière vérification réussie du numéro. Remis à NULL dès que le numéro change.';
COMMENT ON COLUMN public.profiles.phone_otp_pin_id IS
  'Identifiant Infobip de la demande de code en cours. Opaque, sans valeur hors de cet échange.';

-- Ces deux colonnes rejoignent celles que le client ne doit jamais écrire :
-- sans cela, n'importe qui poserait lui-même son phone_verified_at et la
-- vérification ne prouverait plus rien.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
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

  NEW.user_id      := OLD.user_id;
  NEW.role         := OLD.role;
  NEW.is_validated := OLD.is_validated;
  NEW.is_premium   := OLD.is_premium;

  NEW.phone_verified_at := OLD.phone_verified_at;
  NEW.phone_otp_pin_id  := OLD.phone_otp_pin_id;

  -- Changer de numéro invalide la vérification précédente : elle portait sur
  -- l'ancien. L'oublier laisserait un profil marqué « vérifié » avec un numéro
  -- que personne n'a jamais confirmé — pire que pas de vérification du tout,
  -- puisque la mention rassure à tort.
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_verified_at := NULL;
    NEW.phone_otp_pin_id  := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Les deux seules écritures autorisées sur ces colonnes, toutes deux limitées au
-- profil de l'appelant. SECURITY DEFINER pour passer outre le déclencheur
-- ci-dessus, ce qui fait des contrôles écrits ici la seule barrière.
CREATE OR REPLACE FUNCTION public.start_phone_verification(p_pin_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile UUID := public.current_profile_id();
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET phone_otp_pin_id = p_pin_id
   WHERE id = v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_phone_verification(p_pin_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile UUID := public.current_profile_id();
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = '42501';
  END IF;

  -- Le pin_id doit être celui qu'on a nous-mêmes enregistré pour ce profil.
  -- Sans cette clause, un appelant présentant l'identifiant d'une demande
  -- émise pour quelqu'un d'autre ferait valider son propre numéro.
  UPDATE public.profiles
     SET phone_verified_at = NOW(),
         phone_otp_pin_id  = NULL
   WHERE id = v_profile
     AND phone_otp_pin_id = p_pin_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucune demande de vérification en cours pour ce profil.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.start_phone_verification(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_phone_verification(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.confirm_phone_verification(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_phone_verification(TEXT) TO authenticated, service_role;

-- Lisible par le propriétaire et par la modération, comme le reste du profil.
GRANT SELECT (phone_verified_at) ON public.profiles TO anon, authenticated;
