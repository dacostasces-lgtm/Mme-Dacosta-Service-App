-- Un message reçu ne se réécrit pas.
--
-- La politique « Recipients can mark messages read » ouvrait l'UPDATE au
-- destinataire sans `WITH CHECK` ni restriction de colonne. Marquer un message
-- comme lu et en réécrire le texte passaient donc par le même droit : on
-- pouvait changer ce qu'on avait reçu, et jusqu'à son expéditeur — de quoi
-- fabriquer une preuve de toutes pièces dans un litige.

REVOKE UPDATE ON public.messages FROM anon, authenticated;
GRANT UPDATE (is_read) ON public.messages TO authenticated;

DROP POLICY IF EXISTS "Recipients can mark messages read." ON public.messages;
CREATE POLICY "Recipients can mark messages read."
  ON public.messages FOR UPDATE
  USING (receiver_id = public.current_profile_id())
  -- Sans ce `WITH CHECK`, la ligne pouvait être réattribuée à quelqu'un
  -- d'autre au passage : l'UPDATE partait d'une ligne qu'on possède et
  -- atterrissait sur une conversation qu'on ne possède pas.
  WITH CHECK (receiver_id = public.current_profile_id());

-- Le droit colonne suffit pour l'API, mais pas pour une fonction SECURITY
-- DEFINER mal écrite plus tard. Le déclencheur fige le contenu quoi qu'il
-- arrive, comme protect_profile_columns le fait pour les profils.
CREATE OR REPLACE FUNCTION public.protect_message_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  NEW.sender_id   := OLD.sender_id;
  NEW.receiver_id := OLD.receiver_id;
  NEW.content     := OLD.content;
  NEW.type        := OLD.type;
  NEW.sent_at     := OLD.sent_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_message_columns ON public.messages;
CREATE TRIGGER protect_message_columns
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_message_columns();
