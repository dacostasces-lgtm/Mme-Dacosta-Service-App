-- Le blocage des numéros couvre aussi le nom, les compétences et les avis.
--
-- 20261011050000 protégeait les messages, les candidatures, les offres et les
-- présentations — mais pas les champs qu'il restait pour contourner la
-- plateforme : s'appeler « Awa 06 12 34 56 78 », glisser son numéro dans la
-- liste de compétences, ou le laisser dans un avis. Chacun s'affiche
-- publiquement, ce qui suffit à court-circuiter le déblocage payant.
--
-- `skills` et `languages` sont en jsonb : `to_jsonb(NEW) ->> colonne` en rend
-- le texte sérialisé, que l'expression régulière parcourt comme le reste.

DROP TRIGGER IF EXISTS reject_phone_numbers ON public.profiles;
CREATE TRIGGER reject_phone_numbers
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.reject_phone_numbers('full_name');

DROP TRIGGER IF EXISTS reject_phone_numbers ON public.reviews;
CREATE TRIGGER reject_phone_numbers
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.reject_phone_numbers('comment');

-- Remplace le déclencheur posé en 20261011050000, qui ne visait que
-- `description` et `job_title`. Les trois champs ajoutés manquaient.
DROP TRIGGER IF EXISTS reject_phone_numbers ON public.candidate_details;
CREATE TRIGGER reject_phone_numbers
  BEFORE INSERT OR UPDATE ON public.candidate_details
  FOR EACH ROW EXECUTE FUNCTION public.reject_phone_numbers(
    'description', 'job_title', 'skills', 'languages', 'experience'
  );
