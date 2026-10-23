-- Un avis se mérite aussi après un déblocage payé.
--
-- La règle posée par 20261015130000 est la bonne : on ne commente que
-- quelqu'un avec qui on a réellement traité, et « réellement » veut dire que
-- de l'argent a changé de main entre ces deux personnes-là. Elle ne connaît
-- qu'une preuve : une réservation `paid` ou `completed`.
--
-- Or la réservation disparaît de l'offre commerciale. Elle facturait 15 000
-- FCFA une mise en relation que le déblocage de numéro facture désormais 500
-- — deux chemins vers le même service, à trente fois l'écart. La retirer sans
-- toucher à cette fonction rendrait tout nouvel avis impossible : plus aucune
-- réservation ne naîtrait, donc plus aucune paire n'aurait « travaillé
-- ensemble ».
--
-- La preuve change, pas la règle. Un déblocage `active` signifie exactement la
-- même chose qu'une réservation réglée : 500 FCFA versés et validés par
-- l'administration, pour ce couple-là. Les réservations déjà payées restent
-- reconnues — leur historique ne doit pas s'effacer parce que l'offre a changé.

CREATE OR REPLACE FUNCTION public.ont_travaille_ensemble(p_un UUID, p_autre UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Héritage : les réservations réglées avant le changement d'offre.
    EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.status IN ('paid', 'completed')
         AND (
           (b.employer_id = p_un AND b.candidate_id = p_autre)
           OR (b.employer_id = p_autre AND b.candidate_id = p_un)
         )
    )
    -- L'employeur a payé le numéro de la candidate.
    OR EXISTS (
      SELECT 1 FROM public.candidate_unlocks u
       WHERE u.status = 'active'
         AND (
           (u.employer_id = p_un AND u.candidate_id = p_autre)
           OR (u.employer_id = p_autre AND u.candidate_id = p_un)
         )
    )
    -- La candidate a payé le numéro de l'employeur. Le déblocage porte sur une
    -- offre, pas sur une personne : l'employeur se lit sur l'offre.
    OR EXISTS (
      SELECT 1 FROM public.contact_unlocks c
       JOIN public.jobs j ON j.id = c.job_id
       WHERE c.status = 'active'
         AND (
           (c.candidate_id = p_un AND j.employer_id = p_autre)
           OR (c.candidate_id = p_autre AND j.employer_id = p_un)
         )
    );
$$;

COMMENT ON FUNCTION public.ont_travaille_ensemble(UUID, UUID) IS
  'Deux profils ont-ils traité ensemble : réservation réglée (héritage), ou déblocage de numéro payé et validé, dans un sens ou dans l''autre.';

REVOKE ALL ON FUNCTION public.ont_travaille_ensemble(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ont_travaille_ensemble(UUID, UUID) TO authenticated, service_role;
