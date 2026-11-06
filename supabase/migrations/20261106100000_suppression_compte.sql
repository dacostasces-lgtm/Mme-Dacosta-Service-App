-- Supprimer son compte soi-même.
--
-- Effacer la ligne `profiles` ferait tout partir en cascade, paiements
-- compris : réservations, abonnements, numéros débloqués, offres payées,
-- journal PawaPay. Or la politique de confidentialité les garde « le temps
-- requis par les obligations comptables et fiscales ». Le profil reste donc,
-- vidé de tout ce qui désigne la personne, et marqué `deleted_at` ; ce qui ne
-- regarde qu'elle est effacé. Le compte de connexion est supprimé à côté, par
-- l'API d'administration (src/lib/profile/delete-account.ts), et les fichiers
-- de ses dossiers retirés des seaux.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Lisible comme les autres colonnes non sensibles : la modération s'en sert
-- pour écarter ces profils de sa file.
GRANT SELECT (deleted_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile UUID := public.current_profile_id();
  v_role    public.user_role;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = 'P0002';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_profile;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Un compte administrateur ne se supprime pas depuis l''application.'
      USING ERRCODE = '42501';
  END IF;

  -- Ce qui ne regarde que la personne.
  DELETE FROM public.candidate_details   WHERE profile_id = v_profile;
  DELETE FROM public.candidate_addresses WHERE profile_id = v_profile;
  DELETE FROM public.candidate_documents WHERE profile_id = v_profile;
  DELETE FROM public.employer_details    WHERE profile_id = v_profile;
  DELETE FROM public.profile_rejections  WHERE profile_id = v_profile;
  DELETE FROM public.applications        WHERE candidate_id = v_profile;
  -- La politique les garde « tant que les deux comptes existent ».
  DELETE FROM public.messages WHERE sender_id = v_profile OR receiver_id = v_profile;
  -- Les avis reçus portaient sur elle ; ceux qu'elle a laissés restent, signés
  -- « Compte supprimé » : ils parlent du travail de quelqu'un d'autre.
  DELETE FROM public.reviews WHERE reviewee_id = v_profile;

  -- Ses offres sortent de la liste sans disparaître : des paiements y sont
  -- rattachés (offres payantes, numéros débloqués par des candidats).
  UPDATE public.jobs SET status = 'closed' WHERE employer_id = v_profile AND status = 'active';

  UPDATE public.profiles SET
    full_name         = 'Compte supprimé',
    phone             = NULL,
    whatsapp          = NULL,
    email             = NULL,
    avatar_url        = NULL,
    neighborhood_id   = NULL,
    location          = NULL,
    is_validated      = FALSE,
    is_premium        = FALSE,
    phone_verified_at = NULL,
    phone_otp_pin_id  = NULL,
    deleted_at        = COALESCE(deleted_at, NOW()),
    updated_at        = NOW()
  WHERE id = v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated, service_role;
