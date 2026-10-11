-- Une offre expire 15 jours après sa publication ou sa dernière confirmation.
--
-- Sans échéance, une offre pourvue depuis des mois restait en ligne tant que
-- l'employeur ne pensait pas à la fermer — ce qu'il ne fait presque jamais. La
-- liste s'allongeait d'offres mortes, et les candidats postulaient à des postes
-- qui n'existaient plus. L'employeur reçoit un rappel sur son tableau de bord
-- et prolonge d'un clic ; sans réponse, l'offre disparaît d'elle-même.
--
-- L'expiration se lit à la date, sans tâche planifiée : une offre échue cesse
-- d'être publique à la seconde près, et rien ne dépend de pg_cron.

-- Les offres déjà publiées partent de maintenant, pas de leur date de
-- création : sinon toutes celles de plus de 15 jours disparaîtraient d'un
-- coup, sans que leur employeur ait été prévenu.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 days');

CREATE INDEX IF NOT EXISTS idx_jobs_status_expires ON public.jobs(status, expires_at);

-- Lecture publique : une offre échue n'est plus visible que de son employeur
-- (qui doit pouvoir la prolonger) et de l'administration. Toute page qui lit
-- les offres — liste, fiche, sitemap — en hérite sans filtre à oublier.
DROP POLICY IF EXISTS "Active jobs are viewable by everyone." ON public.jobs;
CREATE POLICY "Active jobs are viewable by everyone."
  ON public.jobs FOR SELECT
  USING (
    (status = 'active' AND expires_at > NOW())
    OR employer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR is_admin()
  );

-- Un employeur peut modifier sa propre offre, donc aussi `expires_at` : sans
-- garde, une requête directe à l'API la repousserait en 2099 et la soustrairait
-- au rappel. L'échéance est donc ramenée à 15 jours au plus, quelle que soit la
-- valeur envoyée. L'administration et le rôle de service n'y sont pas soumis.
CREATE OR REPLACE FUNCTION public.clamp_job_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.expires_at := LEAST(NEW.expires_at, NOW() + INTERVAL '15 days');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clamp_job_expiry ON public.jobs;
CREATE TRIGGER clamp_job_expiry
  BEFORE INSERT OR UPDATE OF expires_at ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.clamp_job_expiry();
