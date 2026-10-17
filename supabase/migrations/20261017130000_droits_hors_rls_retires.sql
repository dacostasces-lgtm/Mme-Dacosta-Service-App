-- Retirer aux visiteurs les droits que RLS ne filtre pas.
--
-- Supabase accorde par défaut tous les droits de table à `anon` et
-- `authenticated`, en comptant sur RLS pour trancher ligne par ligne. Cela
-- fonctionne pour SELECT, INSERT, UPDATE et DELETE, qui passent par les
-- politiques. Quatre droits y échappent :
--
--   TRUNCATE   — vide la table d'un coup, sans consulter aucune politique.
--                Vérifié : `SET ROLE anon; TRUNCATE momo_sms_events;` répondait
--                « TRUNCATE TABLE ».
--   TRIGGER    — attache du code à une table.
--   REFERENCES — permet une clé étrangère vers la table, qui répond ensuite
--                « cette ligne existe-t-elle ? » sans la lire.
--   MAINTAIN   — VACUUM, REINDEX, REFRESH MATERIALIZED VIEW.
--
-- Aucun n'est émis par PostgREST : rien dans l'application ne les perd. Ils ne
-- sont donc pas atteignables depuis le site tel qu'il est, et c'est pourquoi ce
-- n'est pas une faille ouverte — mais ils ne laissent à RLS rien à filtrer, et
-- une table qui ne dépend que d'eux n'est protégée par rien.

REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- MAINTAIN n'existe qu'à partir de PostgreSQL 17 ; l'instruction échouerait
-- ailleurs, et une migration doit rester rejouable sur toute version.
DO $$
BEGIN
  REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
EXCEPTION WHEN syntax_error OR feature_not_supported THEN
  NULL;
END $$;

-- Sans cela, la prochaine table créée les recevrait de nouveau : les droits par
-- défaut du schéma portent `arwdDxtm`, soit l'ensemble.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE MAINTAIN ON TABLES FROM anon, authenticated;
EXCEPTION WHEN syntax_error OR feature_not_supported THEN
  NULL;
END $$;

-- Les tables posées par la plateforme elle-même appartiennent à `supabase_admin`
-- et suivent ses propres droits par défaut. Les modifier demande d'être ce rôle,
-- ce que les migrations ne sont pas toujours : on essaie, sans en faire un échec.
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
