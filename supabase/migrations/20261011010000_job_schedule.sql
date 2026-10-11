-- Jours et horaires de service d'une offre, et l'option « dormir sur place ».
--
-- Jusqu'ici ces informations n'existaient que dans le texte libre de la
-- description : impossible de les afficher de façon uniforme, et surtout
-- impossible de chercher une offre par jour ou par horaire.
--
-- Tout est facultatif pour les offres déjà publiées : un tableau vide et des
-- heures nulles veulent dire « non précisé », pas « aucun jour ».

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS work_days TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS live_in BOOLEAN NOT NULL DEFAULT FALSE;

-- Codes fixés par src/lib/jobs/schedule.ts. La recherche compare ces codes
-- exactement : une variante (« Lundi », « lun ») ne serait jamais trouvée.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_work_days_valid;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_work_days_valid
  CHECK (work_days <@ ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::TEXT[]);

-- Filtre « jours où je suis disponible » : work_days <@ sélection.
CREATE INDEX IF NOT EXISTS idx_jobs_work_days ON public.jobs USING GIN (work_days);
