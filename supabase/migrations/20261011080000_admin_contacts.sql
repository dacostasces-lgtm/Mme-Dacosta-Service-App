-- Les coordonnées complètes de chaque inscrit, pour l'administration.
--
-- La modération a besoin du numéro des candidats et des employeurs : pour les
-- appeler avant de publier un profil, pour retrouver quelqu'un, et pour garder
-- sa propre base de contacts. Les colonnes `phone`, `whatsapp` et `email` sont
-- révoquées de l'API depuis 20260728010000_restrict_profile_pii.sql, et les
-- administrateurs partagent le rôle `authenticated` : aucun droit de colonne
-- ne peut les distinguer. Une fonction gardée est donc la seule voie, comme
-- admin_profile_emails() l'était déjà pour l'adresse email.

CREATE OR REPLACE FUNCTION public.admin_profile_contacts(p_ids UUID[])
RETURNS TABLE (
  profile_id     UUID,
  email          TEXT,
  phone          TEXT,
  whatsapp       TEXT,
  phone_verified BOOLEAN
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
    SELECT p.id, p.email, p.phone, p.whatsapp, p.phone_verified_at IS NOT NULL
      FROM public.profiles p
     WHERE p.id = ANY(p_ids);
END;
$$;

-- `anon` nommé explicitement : la base hébergée lui accorde EXECUTE par ses
-- privilèges par défaut (voir 20260728060000_fix_function_grants.sql).
REVOKE ALL ON FUNCTION public.admin_profile_contacts(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_profile_contacts(UUID[]) TO authenticated, service_role;
