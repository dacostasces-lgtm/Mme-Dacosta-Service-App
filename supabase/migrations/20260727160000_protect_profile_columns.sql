-- The profiles UPDATE policy checks *which row* you may touch, never *which
-- columns*. Since `role`, `is_validated` and `is_premium` live on that same row,
-- any authenticated user could PATCH their own profile and grant themselves
-- validation, premium status, or the admin role — and `is_admin()` then opens
-- everything else. Moderation is meaningless until this is closed.
--
-- Column-level GRANTs cannot express it: admins and ordinary users share the
-- same `authenticated` database role, and only differ per row. So a BEFORE
-- UPDATE trigger silently restores the privileged columns for everyone who is
-- not an admin. Silently, rather than raising, so that a legitimate profile
-- update which happens to send back unchanged values still succeeds.

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server-side contexts (service role, migrations, dashboard) are trusted.
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

DROP TRIGGER IF EXISTS protect_profile_columns ON public.profiles;
CREATE TRIGGER protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();
