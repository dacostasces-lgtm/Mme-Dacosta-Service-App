-- Le seau des photos ne se laisse plus énumérer.
--
-- « Avatars are readable by everyone » autorisait le SELECT sur tout
-- `storage.objects` du seau. Récupérer une photo par son adresse n'a jamais eu
-- besoin de cette politique — le seau est public, et le chemin
-- /storage/v1/object/public/… est servi sans RLS, ce qui est bien l'intention :
-- les photos s'affichent dans la recherche.
--
-- Ce que la politique ajoutait, c'était le droit de *lister*. Or les fichiers
-- sont rangés sous `<auth.uid()>/…` : lister le seau rendait donc l'identifiant
-- interne de chaque inscrit, et leur nombre. Un identifiant n'est pas un secret
-- en soi, mais c'est la clé qui sert partout ailleurs, et rien ne justifie de
-- l'offrir.

DROP POLICY IF EXISTS "Avatars are readable by everyone." ON storage.objects;

-- Chacun voit les siennes ; la modération voit tout, puisqu'elle doit pouvoir
-- retirer une photo déplacée.
DROP POLICY IF EXISTS "Les photos se listent par leur propriétaire." ON storage.objects;
CREATE POLICY "Les photos se listent par leur propriétaire."
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR public.is_admin()
    )
  );
