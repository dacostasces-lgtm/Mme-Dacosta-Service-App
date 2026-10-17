-- La récupération par SMS ne se fie qu'à un numéro confirmé, et unique.
--
-- Elle cherchait le profil par `phone`, sans regarder `phone_verified_at`.
-- Deux conséquences :
--
--   — on récupérait un compte par un numéro que personne n'avait prouvé
--     posséder. Il suffisait de s'inscrire avec le numéro de quelqu'un
--     d'autre ;
--   — deux comptes pouvaient porter le même numéro. La recherche renvoyait
--     alors deux lignes, `maybeSingle()` échouait, et la récupération devenait
--     impossible — pour les deux. Déposer le numéro de quelqu'un sur un compte
--     à soi suffisait donc à lui condamner la porte de secours.
--
-- Un index partiel règle le second point sans gêner le premier usage : tant
-- qu'un numéro n'est pas confirmé, plusieurs comptes peuvent le porter — c'est
-- une saisie, pas une preuve. Dès qu'il est confirmé, il est à une seule
-- personne.

-- Si deux comptes affichent déjà le même numéro confirmé, seul le plus ancien
-- le garde : c'est celui qui l'a prouvé en premier. L'autre perd la
-- confirmation, pas le numéro — il pourra la refaire, et échouera s'il ne
-- possède pas la ligne.
WITH doublons AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY phone_verified_at) AS rang
    FROM public.profiles
   WHERE phone IS NOT NULL AND phone_verified_at IS NOT NULL
)
UPDATE public.profiles p
   SET phone_verified_at = NULL
  FROM doublons d
 WHERE p.id = d.id AND d.rang > 1;

DROP INDEX IF EXISTS public.profiles_numero_verifie_unique;
CREATE UNIQUE INDEX profiles_numero_verifie_unique
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND phone_verified_at IS NOT NULL;
