-- Corrects 20260727160000. That migration declared protect_profile_columns() as
-- SECURITY DEFINER, which made it a no-op: inside a SECURITY DEFINER function
-- `current_user` is the function owner (postgres), so the "trusted server-side
-- context" branch matched every caller and the privileged columns were never
-- restored. A self-promotion to `role = 'admin'` still went through.
--
-- The function must run as SECURITY INVOKER so `current_user` is the caller's
-- effective role — `authenticated` for a logged-in user, `service_role` or
-- `postgres` for genuine server-side work. `is_admin()` stays SECURITY DEFINER,
-- which is what lets it read `profiles` without tripping over RLS.

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.user_id      := OLD.user_id;
  NEW.role         := OLD.role;
  NEW.is_validated := OLD.is_validated;
  NEW.is_premium   := OLD.is_premium;
  RETURN NEW;
END;
$$;
