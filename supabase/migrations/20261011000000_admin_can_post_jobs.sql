-- « new row violates row-level security policy for table "jobs" » à la
-- publication d'une offre depuis le compte d'administration.
--
-- L'application laisse un admin passer toutes les portes de rôle
-- (`requireUser`, src/lib/auth/dal.ts) : il atteint donc le formulaire
-- d'offre. La politique d'insertion de la migration initiale, elle, exigeait
-- `role = 'employer'` et refusait la ligne. Depuis la reconstruction du
-- 7 octobre, le seul compte capable de tester le site est justement l'admin
-- (docs/incident-2026-10-07.md) : la publication était impossible pour lui.
--
-- L'admin publie sous son propre profil, comme un employeur. Il ne peut
-- toujours pas créer d'offre au nom d'un autre : `employer_id` doit rester le
-- sien. Les candidats restent refusés.

DROP POLICY IF EXISTS "Employers can insert jobs." ON public.jobs;
CREATE POLICY "Employers can insert jobs."
  ON public.jobs FOR INSERT
  WITH CHECK (
    employer_id IN (
      SELECT id FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('employer', 'admin')
    )
  );
