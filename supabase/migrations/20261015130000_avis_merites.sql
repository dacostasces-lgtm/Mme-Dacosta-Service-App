-- Un avis se mérite : une fois, et seulement après une mission réglée.
--
-- La politique d'écriture ne vérifiait que deux choses : qu'on signe de son
-- propre nom, et qu'on ne se note pas soi-même. N'importe qui pouvait donc
-- noter n'importe qui, autant de fois qu'il le voulait — démolir la note d'une
-- candidate concurrente ne demandait qu'une boucle.
--
-- La note moyenne est ce sur quoi une famille décide à qui elle confie ses
-- enfants. Elle doit refléter des missions réelles.

-- Les doublons existants partent d'abord, sinon la contrainte ne peut pas se
-- poser. Le plus ancien reste : c'est celui qui a le plus de chances d'être
-- sincère, les suivants étant la répétition.
DELETE FROM public.reviews a
 USING public.reviews b
 WHERE a.reviewer_id = b.reviewer_id
   AND a.reviewee_id = b.reviewee_id
   AND a.created_at > b.created_at;

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_un_avis_par_personne;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_un_avis_par_personne UNIQUE (reviewer_id, reviewee_id);

/**
 * Vrai quand deux profils ont réellement travaillé ensemble.
 *
 * C'est-à-dire : une réservation réglée ou terminée entre eux, dans un sens ou
 * dans l'autre. Une réservation seulement demandée ne compte pas — elle
 * n'engage rien et se crée à volonté.
 */
CREATE OR REPLACE FUNCTION public.ont_travaille_ensemble(p_un UUID, p_autre UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.status IN ('paid', 'completed')
       AND (
         (b.employer_id = p_un AND b.candidate_id = p_autre)
         OR (b.employer_id = p_autre AND b.candidate_id = p_un)
       )
  );
$$;

REVOKE ALL ON FUNCTION public.ont_travaille_ensemble(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ont_travaille_ensemble(UUID, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can write reviews as themselves." ON public.reviews;
CREATE POLICY "Un avis après une mission réglée."
  ON public.reviews FOR INSERT
  WITH CHECK (
    reviewer_id = public.current_profile_id()
    AND reviewer_id <> reviewee_id
    AND public.ont_travaille_ensemble(reviewer_id, reviewee_id)
  );

-- Modifier son avis reste possible, le réécrire au nom d'un autre non. Sans
-- politique d'UPDATE, la table n'en acceptait aucun — mais mieux vaut le dire
-- que le laisser au hasard d'une migration future.
DROP POLICY IF EXISTS "Un avis se corrige par son auteur." ON public.reviews;
CREATE POLICY "Un avis se corrige par son auteur."
  ON public.reviews FOR UPDATE
  USING (reviewer_id = public.current_profile_id())
  WITH CHECK (reviewer_id = public.current_profile_id());

-- `reviewer_id` et `reviewee_id` sont figés : les laisser modifiables
-- permettrait de déplacer un avis déjà écrit vers quelqu'un d'autre, en
-- contournant la vérification ci-dessus qui ne joue qu'à l'insertion.
CREATE OR REPLACE FUNCTION public.protect_review_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.reviewer_id := OLD.reviewer_id;
  NEW.reviewee_id := OLD.reviewee_id;
  NEW.created_at  := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_review_columns ON public.reviews;
CREATE TRIGGER protect_review_columns
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_review_columns();
