-- Vérification d'après-déploiement.
--
-- À coller dans l'éditeur SQL du tableau de bord Supabase (ou à passer avec
-- psql) APRÈS `supabase db push`. Lecture seule : rien n'est modifié ici.
--
-- Chaque ligne doit afficher OK. Un ÉCHEC indique précisément la migration
-- qui n'a pas produit son effet.

WITH checks(ordre, migration, verification, obtenu, attendu) AS (
  VALUES
  -- 20260728005000_api_role_grants ------------------------------------------
  (1, '005000 droits API', 'authenticated peut écrire dans profiles',
      has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), true),
  (2, '005000 droits API', 'authenticated peut créer un candidate_details',
      has_table_privilege('authenticated', 'public.candidate_details', 'INSERT'), true),
  (3, '005000 droits API', 'anon peut lire les quartiers',
      has_table_privilege('anon', 'public.neighborhoods', 'SELECT'), true),

  -- 20260728010000_restrict_profile_pii --------------------------------------
  (4, '010000 données perso', 'anon NE PEUT PAS lire le téléphone',
      has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT'), false),
  (5, '010000 données perso', 'anon NE PEUT PAS lire l''email',
      has_column_privilege('anon', 'public.profiles', 'email', 'SELECT'), false),
  (6, '010000 données perso', 'anon NE PEUT PAS lire la position GPS',
      has_column_privilege('anon', 'public.profiles', 'location', 'SELECT'), false),
  (7, '010000 données perso', 'authenticated NE PEUT PAS lire le téléphone',
      has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT'), false),
  (8, '010000 données perso', 'anon peut toujours lire le nom (site public)',
      has_column_privilege('anon', 'public.profiles', 'full_name', 'SELECT'), true),
  (9, '010000 données perso', 'anon peut toujours lire l''avatar',
      has_column_privilege('anon', 'public.profiles', 'avatar_url', 'SELECT'), true),
  (10, '010000 données perso', 'search_candidates est SECURITY DEFINER',
      (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'search_candidates'), true),
  (11, '010000 données perso', 'get_candidate est SECURITY DEFINER',
      (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_candidate'), true),
  (12, '010000 données perso', 'get_candidate renvoie encore les vérifications',
      (SELECT pg_get_function_result(p.oid) LIKE '%identity_checked_at%'
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_candidate'), true),
  (13, '010000 données perso', 'my_contact() existe',
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'my_contact'), true),
  (14, '010000 données perso', 'anon NE PEUT PAS exécuter my_contact()',
      has_function_privilege('anon', 'public.my_contact()', 'EXECUTE'), false),
  (15, '010000 données perso', 'admin_profile_emails() existe (emails de la modération)',
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'admin_profile_emails'), true),

  -- 20260728030000_storage_buckets -------------------------------------------
  (16, '030000 stockage', 'bucket avatars public',
      (SELECT public FROM storage.buckets WHERE id = 'avatars'), true),
  (17, '030000 stockage', 'bucket cvs PRIVÉ',
      (SELECT public FROM storage.buckets WHERE id = 'cvs'), false),
  (18, '030000 stockage', 'politiques de stockage en place (6 attendues)',
      (SELECT count(*) >= 6 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND (policyname ILIKE '%avatar%' OR policyname ILIKE '%CV%')), true),

  -- 20260728040000_settle_ambiguous_reference --------------------------------
  -- Attention : cette migration existait déjà avant d'être corrigée. Si elle a
  -- été appliquée AVANT la correction, db push ne la rejoue pas et ces deux
  -- lignes échouent — c'est exactement ce qu'il faut détecter.
  (19, '040000 SMS MoMo', 'référence ambiguë détectée',
      (SELECT prosrc LIKE '%ambiguous%' FROM pg_proc p JOIN pg_namespace n
         ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'settle_booking_from_sms'), true),
  (20, '040000 SMS MoMo', 'garde anti-course dans l''UPDATE (correctif tardif)',
      (SELECT prosrc LIKE '%AND status = ''pending_payment''%' FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'settle_booking_from_sms'), true),
  (21, '020000 SMS MoMo', 'settle_booking_from_sms interdite à anon',
      has_function_privilege('anon',
        'public.settle_booking_from_sms(text,text,text,integer,text,text)', 'EXECUTE'), false),

  -- 20260728050000_subscriptions_manual --------------------------------------
  (22, '050000 Premium', 'colonne subscriptions.status présente',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'subscriptions'
                 AND column_name = 'status'), true),
  (23, '050000 Premium', 'is_active vaut FALSE par défaut',
      (SELECT column_default LIKE '%false%' FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscriptions'
          AND column_name = 'is_active'), true),
  (24, '050000 Premium', 'end_date est devenue facultative',
      (SELECT is_nullable = 'YES' FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscriptions'
          AND column_name = 'end_date'), true),
  (25, '050000 Premium', 'trigger protect_subscription_columns actif',
      EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgname = 'protect_subscription_columns' AND NOT tgisinternal), true),
  (26, '050000 Premium', 'settle_subscription() existe',
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'settle_subscription'), true),
  (27, '050000 Premium', 'expire_subscriptions() existe (à brancher sur pg_cron)',
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'expire_subscriptions'), true),

  -- Régressions déjà corrigées, revérifiées ici ------------------------------
  (28, 'rappel sécurité', 'protect_profile_columns est SECURITY INVOKER',
      (SELECT NOT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'protect_profile_columns'), true)
)
SELECT
  CASE WHEN obtenu IS NOT DISTINCT FROM attendu THEN 'OK' ELSE '### ÉCHEC ###' END AS resultat,
  migration,
  verification,
  COALESCE(obtenu::text, 'absent') AS obtenu
FROM checks
ORDER BY (obtenu IS NOT DISTINCT FROM attendu), ordre;
