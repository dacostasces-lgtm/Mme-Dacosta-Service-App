import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Everything behind a session. None of it is reachable to a crawler
      // anyway — the proxy sends anonymous visitors to /login — but saying so
      // keeps the redirects out of the crawl budget, and keeps a signed-in
      // page from being indexed if one ever leaks.
      disallow: [
        "/api/",
        "/auth/",
        "/fr/admin",
        "/fr/dashboard",
        "/fr/messages",
        "/fr/profil",
        "/fr/mot-de-passe",
        "/fr/offres/creer",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
