import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
  './src/i18n/request.ts'
);

// Avatars are served from the project's storage bucket, whose host changes
// between local, preview and production. Derived rather than hard-coded so a
// new Supabase project doesn't silently break every image and every fetch.
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null;
  } catch {
    return null;
  }
})();

// The Content-Security-Policy is NOT here: it carries a per-request nonce and
// is therefore built in `src/proxy.ts`. Setting a second, static one at this
// level would leave two policies on the same response — the browser enforces
// the intersection, and the static one's `unsafe-inline` would have to be kept
// permissive enough to not fight the nonce, defeating the point. Everything
// below is request-independent and belongs here.
const SECURITY_HEADERS = [
  // Redundant with the proxy's frame-ancestors on modern browsers, and the
  // only clickjacking defence on the routes the proxy's matcher skips.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation is genuinely used by the signup form, so it stays allowed for
  // this origin; everything else is switched off.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https" as const,
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // A cached service worker is a bug that outlives the deploy meant to
        // fix it: the browser would keep running the old one, still serving the
        // assets it cached, until its own heuristics expired the file.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // `en` was removed from routing.locales, so /en/* would 404. Anything
      // already shared or indexed lands on the French equivalent instead.
      { source: '/en', destination: '/fr', permanent: false },
      { source: '/en/:path*', destination: '/fr/:path*', permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
