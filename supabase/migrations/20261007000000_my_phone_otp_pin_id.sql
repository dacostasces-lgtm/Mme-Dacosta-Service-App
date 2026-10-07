-- La vérification par SMS n'a jamais pu aboutir en production.
--
-- verifyPhoneOtp relit `profiles.phone_otp_pin_id` pour le présenter à Infobip
-- — le relire en base plutôt que le recevoir du formulaire est voulu, sans quoi
-- présenter l'identifiant d'une demande émise pour un autre numéro suffirait à
-- faire marquer le sien comme vérifié. Mais cette colonne, ajoutée par
-- 20260929000000 après la révocation des colonnes sensibles de 20260728010000,
-- n'a jamais reçu de GRANT. La lecture échouait donc en « permission denied »,
-- le profil remontait nul, et la fonction répondait « Aucun code en attente.
-- Demandez-en un nouveau » — à quelqu'un qui tenait le bon code sous les yeux.
-- Il ne restait que l'échappatoire « continuer sans vérifier ».
--
-- Rien ne l'a signalé pendant une semaine pour deux raisons, toutes deux
-- corrigées avec cette migration : le message confondait « lecture impossible »
-- avec « aucune demande », et les tests ne traversent jamais ce chemin puisque
-- Infobip y pointe vers le vide, donc aucune demande n'y est jamais en cours.
--
-- Un GRANT SELECT sur la colonne refermerait le bug en une ligne, mais
-- ouvrirait l'identifiant de demande de tout profil lisible à n'importe quel
-- compte connecté. Il ne permet pas de se faire vérifier à la place d'un autre
-- — confirm_phone_verification revérifie l'appartenance, et Infobip compte les
-- tentatives — mais c'est une fuite sans contrepartie. La colonne reste donc
-- fermée, comme `phone`, et une fonction gardée rend à l'appelant la sienne et
-- rien d'autre : même motif que my_contact().

CREATE OR REPLACE FUNCTION public.my_phone_otp_pin_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phone_otp_pin_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.my_phone_otp_pin_id() IS
  'Identifiant Infobip de la demande de code en cours pour l''appelant. La colonne reste révoquée : ceci en est le seul chemin de lecture.';

-- FROM PUBLIC, anon : Postgres accorde EXECUTE à PUBLIC sur toute fonction
-- nouvelle, et révoquer à un rôle qui en hérite ne change rien. anon
-- n'atteindrait aucune ligne de toute façon, auth.uid() y étant nul, mais
-- c'est un accident du corps de la fonction plutôt qu'une permission.
REVOKE ALL ON FUNCTION public.my_phone_otp_pin_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_phone_otp_pin_id() TO authenticated, service_role;
