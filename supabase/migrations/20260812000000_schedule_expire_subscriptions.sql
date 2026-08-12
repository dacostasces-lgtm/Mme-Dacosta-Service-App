-- `expire_subscriptions()` existait depuis 20260728050000 sans que personne ne
-- l'appelle : un abonnement Premium échu gardait son badge indéfiniment, et le
-- profil restait mis en avant dans la recherche sans être payé. Rien ne l'aurait
-- signalé avant le premier renouvellement manqué.
--
-- La planification a d'abord été posée à la main sur la production, ce qui
-- reproduisait le défaut relevé pour les droits SQL : un réglage vivant dans un
-- seul environnement, invisible du dépôt, perdu à la première recréation du
-- projet. Elle est donc décrite ici.
--
-- Le bloc tolère l'absence de pg_cron plutôt que d'échouer : l'extension n'est
-- pas toujours disponible sur une pile locale, et une migration qui casse
-- `supabase db reset` bloquerait toute la suite de tests pour une tâche de fond.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron indisponible : expiration des abonnements non planifiée.';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- Replanifier plutôt qu'ajouter : sans cela, rejouer la migration ferait
  -- tourner la fonction deux fois par nuit.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-subscriptions') THEN
    PERFORM cron.unschedule('expire-subscriptions');
  END IF;

  -- 03h17 UTC, soit 04h17 à Brazzaville : creux d'activité. Une minute décalée
  -- plutôt que pile à l'heure, pour ne pas rejoindre la bousculade des tâches
  -- que tout le monde programme à minuit.
  PERFORM cron.schedule(
    'expire-subscriptions',
    '17 3 * * *',
    $cron$select public.expire_subscriptions()$cron$
  );
END
$$;
