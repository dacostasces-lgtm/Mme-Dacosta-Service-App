-- Récupération de mot de passe pour les comptes créés avec un numéro seul.
--
-- Depuis que l'inscription accepte un numéro sans adresse email, un mot de
-- passe oublié est définitif : la réinitialisation de Supabase passe par un
-- lien envoyé par email, et il n'y en a pas. C'est exactement le public visé
-- par ce mode d'inscription qui se retrouve enfermé dehors.
--
-- Le déroulé tient en trois temps, et l'état ne peut pas vivre côté client :
-- le demandeur n'a pas de session, et un simple cookie affirmant « ce numéro
-- est vérifié » serait falsifiable, donc suffirait à réinitialiser le mot de
-- passe de n'importe qui. Le cookie ne porte donc qu'un identifiant aléatoire,
-- et c'est cette table qui dit ce qu'il vaut.

CREATE TABLE IF NOT EXISTS public.phone_recovery (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  -- Identifiant Infobip de la demande de code. Opaque, sans valeur hors de
  -- l'échange en cours.
  pin_id      TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Court : une réinitialisation se fait dans la foulée. Une fenêtre large
  -- laisse traîner des autorisations de changer un mot de passe.
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
);

CREATE INDEX IF NOT EXISTS idx_phone_recovery_phone
  ON public.phone_recovery (phone, created_at DESC);

ALTER TABLE public.phone_recovery ENABLE ROW LEVEL SECURITY;

-- Aucune politique, volontairement : RLS sans politique refuse tout. Seul le
-- rôle de service y touche, depuis les actions serveur. Un client qui pourrait
-- lire cette table y trouverait de quoi s'attribuer un compte.
REVOKE ALL ON public.phone_recovery FROM anon, authenticated;

-- Purge des demandes périmées. Sans elle la table grossit indéfiniment, et
-- surtout elle conserve des numéros dont on n'a plus l'usage.
CREATE OR REPLACE FUNCTION public.purge_phone_recovery()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM public.phone_recovery
   WHERE expires_at < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_phone_recovery() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_phone_recovery() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RETURN;
  END IF;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-phone-recovery') THEN
    PERFORM cron.unschedule('purge-phone-recovery');
  END IF;
  PERFORM cron.schedule(
    'purge-phone-recovery', '41 3 * * *',
    $cron$select public.purge_phone_recovery()$cron$
  );
END
$$;
