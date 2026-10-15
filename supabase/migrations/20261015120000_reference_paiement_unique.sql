-- Un numéro de transaction Mobile Money ne sert qu'une fois.
--
-- Cinq tables portent un `payment_reference` — bookings, job_payments,
-- candidate_unlocks, contact_unlocks, subscriptions — et aucune n'imposait
-- l'unicité, ni chez elle ni entre elles. Le même reçu MoMo réglait donc une
-- réservation, une offre, deux déblocages et un abonnement : un paiement,
-- cinq contreparties.
--
-- Une contrainte par table n'y suffirait pas : c'est entre les tables que le
-- rejeu se joue. D'où un registre unique, que chaque déclaration alimente.

CREATE TABLE IF NOT EXISTS public.payment_references (
  -- Normalisée à l'écriture : « mp260728.1432 » et « MP260728.1432 » sont le
  -- même reçu, et seule une forme canonique peut être comparée.
  reference  TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  row_id     UUID NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_references ENABLE ROW LEVEL SECURITY;

-- Personne ne lit cette table par l'API : elle ne sert qu'aux fonctions
-- ci-dessous, qui s'exécutent en SECURITY DEFINER. Une politique de lecture
-- exposerait les reçus de tout le monde.
DROP POLICY IF EXISTS "Admins read payment references." ON public.payment_references;
CREATE POLICY "Admins read payment references."
  ON public.payment_references FOR SELECT
  USING (public.is_admin());

REVOKE ALL ON public.payment_references FROM anon, authenticated;
GRANT SELECT ON public.payment_references TO authenticated;

-- Ne garde que lettres et chiffres, en majuscules.
--
-- Retirer les seuls espaces ne suffisait pas : « MP-TEST-001 » et
-- « mp test 001 » restaient deux chaînes distinctes, et le rejeu passait. Les
-- opérateurs ponctuent leurs reçus de points et de tirets, et un fraudeur n'a
-- qu'à en changer un.
--
-- Le revers assumé : deux reçus réellement différents qui ne diffèrent que par
-- la ponctuation se confondraient. Le second serait refusé à tort — visible,
-- et rattrapable à la main par la modération. L'erreur inverse, elle, coûte un
-- encaissement.
CREATE OR REPLACE FUNCTION public.normalise_reference(p_reference TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(UPPER(REGEXP_REPLACE(COALESCE(p_reference, ''), '[^a-zA-Z0-9]', '', 'g')), '');
$$;

/**
 * Enregistre un reçu, ou refuse s'il a déjà servi.
 *
 * Appelée par chaque `declare_*`. Le message est volontairement le même quelle
 * que soit la contrepartie d'origine : dire « déjà utilisé pour une offre »
 * renseignerait un tiers sur les achats d'autrui.
 */
CREATE OR REPLACE FUNCTION public.claim_payment_reference(
  p_reference  TEXT,
  p_kind       TEXT,
  p_row_id     UUID,
  p_profile_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref TEXT := public.normalise_reference(p_reference);
BEGIN
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Référence de transaction invalide.' USING ERRCODE = 'check_violation';
  END IF;

  -- Rejouer la même déclaration sur la *même* ligne n'est pas une fraude :
  -- c'est un double clic, ou une reprise après une erreur réseau.
  IF EXISTS (
    SELECT 1 FROM public.payment_references
     WHERE reference = v_ref AND kind = p_kind AND row_id = p_row_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.payment_references (reference, kind, row_id, profile_id)
  VALUES (v_ref, p_kind, p_row_id, p_profile_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Ce numéro de transaction a déjà été utilisé pour un autre paiement.'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_reference(TEXT, TEXT, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_reference(TEXT, TEXT, UUID, UUID) TO service_role;

-- Les reçus déjà déclarés entrent au registre, sinon la première déclaration
-- suivante les redéclarerait librement. ON CONFLICT DO NOTHING : si le même
-- reçu a déjà servi plusieurs fois avant ce correctif, on garde le premier et
-- on n'échoue pas ici — le mal est fait, l'empêcher à l'avenir suffit.
INSERT INTO public.payment_references (reference, kind, row_id, profile_id)
SELECT public.normalise_reference(payment_reference), 'booking', id, employer_id
  FROM public.bookings WHERE public.normalise_reference(payment_reference) IS NOT NULL
ON CONFLICT (reference) DO NOTHING;

INSERT INTO public.payment_references (reference, kind, row_id, profile_id)
SELECT public.normalise_reference(payment_reference), 'job', id, employer_id
  FROM public.job_payments WHERE public.normalise_reference(payment_reference) IS NOT NULL
ON CONFLICT (reference) DO NOTHING;

INSERT INTO public.payment_references (reference, kind, row_id, profile_id)
SELECT public.normalise_reference(payment_reference), 'candidate_unlock', id, employer_id
  FROM public.candidate_unlocks WHERE public.normalise_reference(payment_reference) IS NOT NULL
ON CONFLICT (reference) DO NOTHING;

INSERT INTO public.payment_references (reference, kind, row_id, profile_id)
SELECT public.normalise_reference(payment_reference), 'contact_unlock', id, candidate_id
  FROM public.contact_unlocks WHERE public.normalise_reference(payment_reference) IS NOT NULL
ON CONFLICT (reference) DO NOTHING;

INSERT INTO public.payment_references (reference, kind, row_id, profile_id)
SELECT public.normalise_reference(payment_reference), 'subscription', id, profile_id
  FROM public.subscriptions WHERE public.normalise_reference(payment_reference) IS NOT NULL
ON CONFLICT (reference) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Le registre s'alimente par déclencheur, pas en réécrivant les cinq fonctions
-- `declare_*`. Elles portent chacune leurs propres contrôles de propriété et
-- d'état ; les recopier pour y glisser une ligne, c'est risquer d'en perdre
-- un. Un déclencheur attrape en plus les chemins qui ne passent pas par elles :
-- le règlement par SMS, et les écritures de la modération.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_reference_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ancienne TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_reference END;
  v_owner    UUID;
BEGIN
  IF NEW.payment_reference IS NULL
     OR NEW.payment_reference IS NOT DISTINCT FROM v_ancienne THEN
    RETURN NEW;
  END IF;

  -- La colonne qui porte le payeur change d'une table à l'autre ; son nom
  -- arrive en argument du déclencheur.
  v_owner := (to_jsonb(NEW) ->> TG_ARGV[1])::UUID;

  PERFORM public.claim_payment_reference(
    NEW.payment_reference, TG_ARGV[0], NEW.id, v_owner
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_reference ON public.bookings;
CREATE TRIGGER claim_reference
  BEFORE INSERT OR UPDATE OF payment_reference ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.claim_reference_on_write('booking', 'employer_id');

DROP TRIGGER IF EXISTS claim_reference ON public.job_payments;
CREATE TRIGGER claim_reference
  BEFORE INSERT OR UPDATE OF payment_reference ON public.job_payments
  FOR EACH ROW EXECUTE FUNCTION public.claim_reference_on_write('job', 'employer_id');

DROP TRIGGER IF EXISTS claim_reference ON public.candidate_unlocks;
CREATE TRIGGER claim_reference
  BEFORE INSERT OR UPDATE OF payment_reference ON public.candidate_unlocks
  FOR EACH ROW EXECUTE FUNCTION public.claim_reference_on_write('candidate_unlock', 'employer_id');

DROP TRIGGER IF EXISTS claim_reference ON public.contact_unlocks;
CREATE TRIGGER claim_reference
  BEFORE INSERT OR UPDATE OF payment_reference ON public.contact_unlocks
  FOR EACH ROW EXECUTE FUNCTION public.claim_reference_on_write('contact_unlock', 'candidate_id');

DROP TRIGGER IF EXISTS claim_reference ON public.subscriptions;
CREATE TRIGGER claim_reference
  BEFORE INSERT OR UPDATE OF payment_reference ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.claim_reference_on_write('subscription', 'profile_id');
