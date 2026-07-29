import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "../globals.css";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
// Shared with robots.ts and sitemap.ts, which must resolve to the same origin
// as `metadataBase` below or the sitemap contradicts the canonical tags.
import { SITE_URL } from "@/lib/site";

import { routing } from '@/i18n/routing';
import { Navbar } from '@/components/shared/Navbar';
import { themeBootScript } from '@/components/shared/ThemeToggle';
import { BottomNav } from '@/components/shared/BottomNav';
import { ServiceWorker } from '@/components/shared/ServiceWorker';
import { Footer } from '@/components/shared/Footer';

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Headings run on a serif so the brand reads as a service house rather than a
// generic SaaS. Body copy stays on Inter for legibility on small phones.
const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});


const DESCRIPTION =
  "Nounous, ménagères, cuisiniers et chauffeurs au dossier vérifié, près de chez vous à Brazzaville et Pointe-Noire. Recherche par quartier, mise en relation directe, sans commission sur le salaire.";

// Served from public/ and declared by hand rather than via the
// `opengraph-image` file convention: that convention nested inside the dynamic
// `[locale]` segment builds fine locally but fails on Vercel with
// "Invariant: failed to find source route /[locale]/opengraph-image.jpg".
const OG_IMAGE = {
  url: "/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "Madame Dacosta Services — le personnel de maison vérifié à Brazzaville et Pointe-Noire",
};

export const metadata: Metadata = {
  // Required for the opengraph-image/twitter-image file conventions to resolve
  // to absolute URLs — WhatsApp and Facebook reject relative ones outright.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Madame Dacosta Services — Personnel de maison vérifié",
    template: "%s · Madame Dacosta Services",
  },
  description: DESCRIPTION,
  applicationName: "Madame Dacosta Services",
  keywords: [
    "personnel de maison",
    "nounou",
    "ménagère",
    "cuisinier",
    "chauffeur",
    "gouvernante",
    "Brazzaville",
    "Pointe-Noire",
    "Congo",
  ],
  openGraph: {
    type: "website",
    siteName: "Madame Dacosta Services",
    locale: "fr_FR",
    url: SITE_URL,
    title: "Madame Dacosta Services — Personnel de maison vérifié",
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Madame Dacosta Services — Personnel de maison vérifié",
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

// viewportFit: 'cover' is what makes env(safe-area-inset-*) resolve to real
// values — without it the bottom tab bar sits under the iPhone home indicator
// when the PWA runs standalone.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#B83A9C",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  // Set by `proxy.ts` alongside the CSP it generates for this request.
  // Null on any route the proxy's matcher skips, where no policy is sent
  // either — so an unstamped script there is not blocked.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint. Must run synchronously
            in <head>, otherwise dark-mode users get a white flash.

            The nonce is required, not decorative: this is the one inline script
            the app writes itself, so Next.js does not stamp it automatically
            and the CSP in `proxy.ts` would refuse to run it. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      {/* pt-16 clears the fixed Navbar; the pb reserves the mobile tab bar's
          row (plus the safe-area inset) so the Footer stays reachable. */}
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground pt-16 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <NextIntlClientProvider messages={messages}>
          <Navbar />
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          <Footer />
          <BottomNav />
          <ServiceWorker />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
