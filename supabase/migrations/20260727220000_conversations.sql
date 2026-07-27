-- Real messaging needs two things the schema didn't have.
--
-- 1. You must be able to see who you are talking to. The profiles SELECT policy
--    only exposes validated profiles, so an employer awaiting moderation would
--    vanish from their own correspondent's inbox — the conversation would still
--    exist but show no name. The new policy grants visibility to anyone you have
--    actually exchanged a message with.
--
--    The check goes through a SECURITY DEFINER function on purpose: reading
--    `messages` directly inside a `profiles` policy would re-enter the messages
--    policy, which itself reads `profiles`, and Postgres would abort on infinite
--    recursion. Running as owner bypasses RLS on messages and breaks the cycle.
CREATE OR REPLACE FUNCTION public.has_conversation_with(other UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE (m.sender_id = other AND m.receiver_id = public.current_profile_id())
       OR (m.receiver_id = other AND m.sender_id = public.current_profile_id())
  );
$$;

DROP POLICY IF EXISTS "Correspondents are visible to each other." ON public.profiles;
CREATE POLICY "Correspondents are visible to each other."
  ON public.profiles FOR SELECT
  USING (public.has_conversation_with(id));

-- 2. An inbox: one row per correspondent, with the last message and the unread
--    count. SECURITY INVOKER, so the messages policy still decides what counts.
CREATE OR REPLACE FUNCTION public.list_conversations()
RETURNS TABLE (
  profile_id UUID,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH threads AS (
    SELECT
      CASE
        WHEN m.sender_id = public.current_profile_id() THEN m.receiver_id
        ELSE m.sender_id
      END AS counterpart,
      m.content,
      m.sent_at,
      m.is_read,
      m.receiver_id
    FROM public.messages m
  )
  SELECT
    t.counterpart,
    p.full_name,
    p.avatar_url,
    p.role::TEXT,
    (ARRAY_AGG(t.content ORDER BY t.sent_at DESC))[1],
    MAX(t.sent_at),
    COUNT(*) FILTER (
      WHERE NOT t.is_read AND t.receiver_id = public.current_profile_id()
    )
  FROM threads t
  JOIN public.profiles p ON p.id = t.counterpart
  GROUP BY t.counterpart, p.full_name, p.avatar_url, p.role
  ORDER BY MAX(t.sent_at) DESC;
$$;

-- Marks a correspondent's messages as read. Restricted to messages addressed to
-- the caller, so nobody can flip someone else's inbox.
CREATE OR REPLACE FUNCTION public.mark_conversation_read(other UUID)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.messages
     SET is_read = TRUE
   WHERE sender_id = other
     AND receiver_id = public.current_profile_id()
     AND NOT is_read;
$$;

-- The messages policies covered SELECT and INSERT but never UPDATE, so marking
-- a message read was silently impossible.
DROP POLICY IF EXISTS "Recipients can mark messages read." ON public.messages;
CREATE POLICY "Recipients can mark messages read."
  ON public.messages FOR UPDATE
  USING (receiver_id = public.current_profile_id());
