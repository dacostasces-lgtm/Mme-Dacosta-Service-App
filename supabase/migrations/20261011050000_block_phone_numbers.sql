-- Pas de numéro de téléphone dans les textes que les utilisateurs s'échangent.
--
-- Le numéro de l'employeur se paie (20261011040000_employer_contact.sql). Le
-- glisser dans un message, une candidature ou une offre contournerait ce
-- paiement, et c'est aussi la porte des arnaques qui font sortir une
-- conversation de la plateforme avant toute vérification.
--
-- Vérifié en base et pas seulement dans les actions : l'API Supabase est
-- appelable directement avec la clé publique, et une règle qui ne vit que dans
-- le code de l'application se contourne en une requête.
--
-- Ce qui est détecté (même règle que src/lib/contact/phone-filter.ts) :
--   * 9 chiffres ou plus, même séparés par des espaces, points, tirets ou
--     parenthèses : « 06 717 30 30 », « 06.717.30.30 », « +242 06 717 30 30 » ;
--   * un lien WhatsApp direct (wa.me, api.whatsapp.com).
-- Neuf chiffres et non huit : un numéro congolais en compte neuf, alors qu'une
-- date (« 11.10.2026 ») ou un montant (« 10 000 000 ») en comptent huit au plus.
-- Un numéro écrit en lettres passe : aucun filtre ne les arrête tous, celui-ci
-- arrête le cas courant.

CREATE OR REPLACE FUNCTION public.contains_phone_number(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_text IS NOT NULL AND (
    regexp_replace(p_text, '(?<=[0-9])[ .()\-]{1,3}(?=[0-9])', '', 'g') ~ '[0-9]{9,}'
    OR p_text ~* '(wa\.me/|api\.whatsapp\.com|chat\.whatsapp\.com)'
  );
$$;

CREATE OR REPLACE FUNCTION public.reject_phone_numbers()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_column TEXT;
  v_value  TEXT;
BEGIN
  -- L'administration saisit des fiches à la main et peut avoir besoin d'écrire
  -- un numéro ; le rôle de service est celui des tâches internes.
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  FOREACH v_column IN ARRAY TG_ARGV LOOP
    v_value := to_jsonb(NEW) ->> v_column;
    IF public.contains_phone_number(v_value) THEN
      RAISE EXCEPTION 'Les numéros de téléphone ne peuvent pas être partagés dans l''application.'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_phone_numbers ON public.messages;
CREATE TRIGGER reject_phone_numbers
  BEFORE INSERT OR UPDATE OF content ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.reject_phone_numbers('content');

DROP TRIGGER IF EXISTS reject_phone_numbers ON public.applications;
CREATE TRIGGER reject_phone_numbers
  BEFORE INSERT OR UPDATE OF message ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.reject_phone_numbers('message');

DROP TRIGGER IF EXISTS reject_phone_numbers ON public.jobs;
CREATE TRIGGER reject_phone_numbers
  BEFORE INSERT OR UPDATE OF title, description ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.reject_phone_numbers('title', 'description');

DROP TRIGGER IF EXISTS reject_phone_numbers ON public.candidate_details;
CREATE TRIGGER reject_phone_numbers
  BEFORE INSERT OR UPDATE OF description, job_title ON public.candidate_details
  FOR EACH ROW EXECUTE FUNCTION public.reject_phone_numbers('description', 'job_title');

DROP TRIGGER IF EXISTS reject_phone_numbers ON public.employer_details;
CREATE TRIGGER reject_phone_numbers
  BEFORE INSERT OR UPDATE OF description, company_name ON public.employer_details
  FOR EACH ROW EXECUTE FUNCTION public.reject_phone_numbers('description', 'company_name');
