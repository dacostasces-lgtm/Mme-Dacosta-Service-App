-- Des limites qui survivent au redémarrage, et un plafond sur le crédit SMS.
--
-- Les limites existantes vivent dans la mémoire du serveur. Sur un hébergement
-- sans état, chaque instance a la sienne et un démarrage à froid la remet à
-- zéro : le plafond réel vaut « limite × instances », et il suffit d'attendre
-- un recyclage pour repartir. Pour un envoi de SMS, chaque passage coûte de
-- l'argent, et un script qui ouvre des comptes en boucle vide le crédit
-- Infobip — après quoi plus personne ne peut s'inscrire ni récupérer son mot
-- de passe.
--
-- Le compteur passe donc en base, partagé par toutes les instances, avec en
-- plus un plafond global par jour que rien ne contournait jusqu'ici.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  cle        TEXT PRIMARY KEY,
  compte     INT NOT NULL DEFAULT 0,
  fenetre_fin TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

/**
 * Consomme un jeton, ou refuse.
 *
 * Renvoie le nombre de secondes à attendre, ou 0 si le passage est accordé.
 * `ON CONFLICT` plutôt qu'un SELECT puis UPDATE : deux requêtes simultanées
 * passeraient toutes deux le test avant d'écrire, et la limite serait
 * franchissable à deux exactement au moment où elle compte.
 */
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_cle     TEXT,
  p_limite  INT,
  p_fenetre INT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fin    TIMESTAMPTZ;
  v_compte INT;
BEGIN
  INSERT INTO public.rate_limits (cle, compte, fenetre_fin)
  VALUES (p_cle, 1, NOW() + MAKE_INTERVAL(secs => p_fenetre))
  ON CONFLICT (cle) DO UPDATE
    SET compte = CASE
          WHEN public.rate_limits.fenetre_fin <= NOW() THEN 1
          ELSE public.rate_limits.compte + 1
        END,
        fenetre_fin = CASE
          WHEN public.rate_limits.fenetre_fin <= NOW()
          THEN NOW() + MAKE_INTERVAL(secs => p_fenetre)
          ELSE public.rate_limits.fenetre_fin
        END
  RETURNING compte, fenetre_fin INTO v_compte, v_fin;

  IF v_compte > p_limite THEN
    RETURN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_fin - NOW())))::INT);
  END IF;

  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) TO service_role;

-- Les fenêtres closes ne servent plus à rien et la table grossirait sans fin.
-- pg_cron tourne déjà sur ce projet pour l'expiration des abonnements.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-rate-limits')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-rate-limits');
    PERFORM cron.schedule(
      'purge-rate-limits', '23 4 * * *',
      $cron$DELETE FROM public.rate_limits WHERE fenetre_fin < NOW() - INTERVAL '1 day'$cron$
    );
  END IF;
END $$;
