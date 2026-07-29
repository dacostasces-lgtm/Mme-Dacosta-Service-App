import type { MetadataRoute } from "next";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { localisedUrl } from "@/lib/site";

/**
 * Built from the database rather than hand-listed, so a new posting is
 * discoverable without a deploy.
 *
 * Anonymous-visible rows only: the queries run through the ordinary client, so
 * RLS already limits jobs to `status = 'active'` and candidates to validated
 * profiles. Listing a URL a crawler then gets redirected away from is worse
 * than not listing it.
 */
export const revalidate = 3600;

const STATIC_PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/candidats", priority: 0.9, changeFrequency: "daily" },
  { path: "/offres", priority: 0.9, changeFrequency: "daily" },
  { path: "/pricing", priority: 0.5, changeFrequency: "monthly" },
  { path: "/cgu", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal", priority: 0.2, changeFrequency: "yearly" },
  // /login and /register are deliberately absent: they carry no content to
  // rank, and indexing them wastes crawl budget on the same two forms.
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map((page) => ({
    url: localisedUrl(page.path),
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  if (!isSupabaseConfigured()) {
    return entries;
  }

  const supabase = createAnonClient();

  const [jobs, candidates] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, updated_at, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("profiles")
      .select("id, updated_at")
      .eq("role", "candidate")
      .eq("is_validated", true)
      .order("updated_at", { ascending: false })
      .limit(5000),
  ]);

  for (const job of jobs.data ?? []) {
    entries.push({
      url: localisedUrl(`/offres/${job.id}`),
      lastModified: new Date((job.updated_at as string) ?? (job.created_at as string)),
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  for (const candidate of candidates.data ?? []) {
    entries.push({
      url: localisedUrl(`/candidats/${candidate.id}`),
      lastModified: new Date(candidate.updated_at as string),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return entries;
}
