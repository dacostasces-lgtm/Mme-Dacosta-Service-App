import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
  './src/i18n/request.ts'
);

const nextConfig: NextConfig = {
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
