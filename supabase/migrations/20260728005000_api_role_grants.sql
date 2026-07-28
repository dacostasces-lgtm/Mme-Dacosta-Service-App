-- The schema has never granted anything to the PostgREST roles. It works on the
-- hosted project only because that database was created when Supabase still
-- applied `GRANT ALL ON TABLES TO anon, authenticated` by default. On a fresh
-- `supabase start` every table comes back with no DML privilege at all, and the
-- app is dead at the SQL layer before RLS is ever consulted — a clone of this
-- repository cannot be run, and re-creating the project would break production.
--
-- Privileges are therefore made explicit. They are deliberately as broad as the
-- old defaults rather than trimmed to today's queries: RLS and the column
-- triggers are what actually authorise anything here, and this migration exists
-- to reproduce the environment, not to redesign the security model. The one
-- exception is `profiles`, whose SELECT is narrowed column by column in
-- 20260728010000_restrict_profile_pii.sql — which runs after this file and must
-- keep the last word.

GRANT SELECT ON
  public.cities,
  public.neighborhoods
TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles,
  public.candidate_details,
  public.employer_details,
  public.jobs,
  public.applications,
  public.messages,
  public.reviews,
  public.subscriptions,
  public.bookings
TO anon, authenticated;

-- Every primary key is a gen_random_uuid() default, so there are no sequences
-- to grant alongside these.
