-- L'inscription accepte désormais un email OU un numéro, pas les deux.
--
-- La porte de vérification posée dans requireUser doit donc distinguer « numéro
-- non vérifié » de « pas de numéro du tout » : sans cela, un compte créé avec
-- une adresse email seule serait renvoyé indéfiniment vers un écran lui
-- réclamant un code pour un numéro qui n'existe pas.
--
-- La colonne `phone` est illisible depuis 20260728010000 — c'est voulu, elle
-- part sinon dans l'API publique. Cette colonne calculée n'expose que sa
-- présence, jamais sa valeur, ce qui suffit à la décision et ne révèle rien.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_present BOOLEAN
  GENERATED ALWAYS AS (phone IS NOT NULL) STORED;

COMMENT ON COLUMN public.profiles.phone_present IS
  'Présence d''un numéro, sans en révéler la valeur. Sert à décider si la vérification par SMS s''applique.';

GRANT SELECT (phone_present) ON public.profiles TO anon, authenticated;
