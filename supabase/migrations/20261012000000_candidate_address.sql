-- L'adresse précise d'un candidat, en plus de son quartier.
--
-- Elle ne va pas dans `candidate_details` : cette table se lit par l'API comme
-- le profil auquel elle appartient, donc par tout le monde pour un profil
-- publié. Une adresse de domicile n'a rien à faire dans une fiche publique.
-- Elle a donc sa table, lisible du seul candidat et de l'administration —
-- comme l'adresse de l'employeur dans `employer_details`.

CREATE TABLE IF NOT EXISTS public.candidate_addresses (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  address    TEXT NOT NULL CHECK (char_length(btrim(address)) BETWEEN 3 AND 200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.candidate_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Candidate address visible to its owner and admins." ON public.candidate_addresses;
CREATE POLICY "Candidate address visible to its owner and admins."
  ON public.candidate_addresses FOR SELECT
  USING (profile_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Candidates write their own address." ON public.candidate_addresses;
CREATE POLICY "Candidates write their own address."
  ON public.candidate_addresses FOR INSERT
  WITH CHECK (profile_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Candidates update their own address." ON public.candidate_addresses;
CREATE POLICY "Candidates update their own address."
  ON public.candidate_addresses FOR UPDATE
  USING (profile_id = public.current_profile_id() OR public.is_admin())
  WITH CHECK (profile_id = public.current_profile_id() OR public.is_admin());

-- La base hébergée accorde tout par défaut sur une nouvelle table (voir
-- 20261011040000) : rien pour un visiteur, et pas de suppression — une adresse
-- se corrige, elle ne s'efface pas depuis l'application.
REVOKE ALL ON public.candidate_addresses FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.candidate_addresses TO authenticated;
