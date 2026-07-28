-- `profiles.avatar_url` and `candidate_details.cv_url` have existed since the
-- initial schema with nowhere to put a file: no bucket was ever created, so
-- neither column could hold anything. For domestic staff the photo is what an
-- employer looks at first, and the CV is what justifies the rate — both are
-- part of the product, not decoration.
--
-- Two buckets, because they are read by different people:
--   avatars  — public. They are shown on the search listing, which anonymous
--              visitors browse, so a signed URL per card would mean a round
--              trip per result.
--   cvs      — private. A CV carries an address, a birth date and previous
--              employers; it is handed out through a signed URL, never listed.
--
-- Paths are `<auth.uid()>/<file>` in both buckets. The policies below pin the
-- first folder segment to the caller, which is what stops one candidate
-- overwriting another's photo.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', TRUE, 2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cvs', 'cvs', FALSE, 5242880,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- avatars ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Avatars are readable by everyone." ON storage.objects;
CREATE POLICY "Avatars are readable by everyone."
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users manage their own avatar." ON storage.objects;
CREATE POLICY "Users manage their own avatar."
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users replace their own avatar." ON storage.objects;
CREATE POLICY "Users replace their own avatar."
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users delete their own avatar." ON storage.objects;
CREATE POLICY "Users delete their own avatar."
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- cvs -------------------------------------------------------------------------
-- Readable by the owner and by admins only. Employers reach a CV through a
-- signed URL minted server-side once they are entitled to it, so no policy
-- grants them a standing read.
DROP POLICY IF EXISTS "CVs are readable by their owner and admins." ON storage.objects;
CREATE POLICY "CVs are readable by their owner and admins."
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cvs'
    AND ((storage.foldername(name))[1] = auth.uid()::TEXT OR public.is_admin())
  );

DROP POLICY IF EXISTS "Candidates upload their own CV." ON storage.objects;
CREATE POLICY "Candidates upload their own CV."
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Candidates replace their own CV." ON storage.objects;
CREATE POLICY "Candidates replace their own CV."
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Candidates delete their own CV." ON storage.objects;
CREATE POLICY "Candidates delete their own CV."
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cvs'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );
