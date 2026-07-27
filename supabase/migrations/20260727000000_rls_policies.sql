-- RLS was enabled on every table in the initial schema, but five of them never
-- got a policy: candidate_details, employer_details, subscriptions,
-- applications and reviews. RLS with no policy denies everything, so those
-- tables are currently invisible to the app — reads return zero rows and writes
-- are refused, both without raising an error. This migration fills the gap.

-- Hardening: a SECURITY DEFINER function with a mutable search_path can be
-- hijacked by a caller-controlled schema. Pin it.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- The caller's own profile id, for ownership checks on child tables.
CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid();
$$;

-- candidate_details ----------------------------------------------------------
-- Visibility is delegated to `profiles`: the EXISTS subquery is itself filtered
-- by the profiles SELECT policy, so these rows follow the parent profile's
-- visibility rules automatically and can never drift out of sync with them.
DROP POLICY IF EXISTS "Candidate details follow profile visibility." ON public.candidate_details;
CREATE POLICY "Candidate details follow profile visibility."
  ON public.candidate_details FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = candidate_details.profile_id));

DROP POLICY IF EXISTS "Candidates can insert own details." ON public.candidate_details;
CREATE POLICY "Candidates can insert own details."
  ON public.candidate_details FOR INSERT
  WITH CHECK (profile_id = public.current_profile_id());

DROP POLICY IF EXISTS "Candidates can update own details." ON public.candidate_details;
CREATE POLICY "Candidates can update own details."
  ON public.candidate_details FOR UPDATE
  USING (profile_id = public.current_profile_id() OR public.is_admin());

-- employer_details -----------------------------------------------------------
-- Kept private (address, internal description) rather than mirroring profiles.
DROP POLICY IF EXISTS "Employers can view own details." ON public.employer_details;
CREATE POLICY "Employers can view own details."
  ON public.employer_details FOR SELECT
  USING (profile_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Employers can insert own details." ON public.employer_details;
CREATE POLICY "Employers can insert own details."
  ON public.employer_details FOR INSERT
  WITH CHECK (profile_id = public.current_profile_id());

DROP POLICY IF EXISTS "Employers can update own details." ON public.employer_details;
CREATE POLICY "Employers can update own details."
  ON public.employer_details FOR UPDATE
  USING (profile_id = public.current_profile_id() OR public.is_admin());

-- subscriptions --------------------------------------------------------------
-- Read-only for users on purpose: a client must never be able to grant itself a
-- subscription. Writes go through the service role (webhook / server action).
DROP POLICY IF EXISTS "Users can view own subscriptions." ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions."
  ON public.subscriptions FOR SELECT
  USING (profile_id = public.current_profile_id() OR public.is_admin());

-- applications ---------------------------------------------------------------
DROP POLICY IF EXISTS "Applications visible to candidate and hiring employer." ON public.applications;
CREATE POLICY "Applications visible to candidate and hiring employer."
  ON public.applications FOR SELECT
  USING (
    candidate_id = public.current_profile_id()
    OR job_id IN (SELECT id FROM public.jobs WHERE employer_id = public.current_profile_id())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Candidates can apply." ON public.applications;
CREATE POLICY "Candidates can apply."
  ON public.applications FOR INSERT
  WITH CHECK (
    candidate_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = candidate_id AND p.role = 'candidate'
    )
  );

-- The employer drives the pipeline (new → contact → interview → hired), so they
-- own the status; the candidate may still withdraw their own application.
DROP POLICY IF EXISTS "Hiring employer can update applications." ON public.applications;
CREATE POLICY "Hiring employer can update applications."
  ON public.applications FOR UPDATE
  USING (
    job_id IN (SELECT id FROM public.jobs WHERE employer_id = public.current_profile_id())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Candidates can withdraw own application." ON public.applications;
CREATE POLICY "Candidates can withdraw own application."
  ON public.applications FOR DELETE
  USING (candidate_id = public.current_profile_id() OR public.is_admin());

-- reviews --------------------------------------------------------------------
DROP POLICY IF EXISTS "Reviews are viewable by everyone." ON public.reviews;
CREATE POLICY "Reviews are viewable by everyone."
  ON public.reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can write reviews as themselves." ON public.reviews;
CREATE POLICY "Users can write reviews as themselves."
  ON public.reviews FOR INSERT
  WITH CHECK (reviewer_id = public.current_profile_id() AND reviewer_id <> reviewee_id);

DROP POLICY IF EXISTS "Users can edit own reviews." ON public.reviews;
CREATE POLICY "Users can edit own reviews."
  ON public.reviews FOR UPDATE
  USING (reviewer_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own reviews." ON public.reviews;
CREATE POLICY "Users can delete own reviews."
  ON public.reviews FOR DELETE
  USING (reviewer_id = public.current_profile_id() OR public.is_admin());
