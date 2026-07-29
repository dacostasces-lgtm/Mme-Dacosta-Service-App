import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { themeBootScript } from "@/components/shared/ThemeToggle";
import { SITE_URL } from "@/lib/site";

/**
 * Layout racine.
 *
 * Il n'en existait aucun : `[locale]/layout.tsx` émettait lui-même html/body et
 * en tenait lieu. Next tolère cette forme pour les pages qui s'affichent, mais
 * pas pour composer une 404 — un `notFound()` levé dans une page renvoyait un
 * corps entièrement vide, donc une page blanche sur chaque offre expirée et
 * chaque profil retiré. La documentation nomme précisément ce cas : « votre
 * layout racine est défini avec un segment dynamique de premier niveau ».
 *
 * html/body vivent donc ici, et `[locale]/layout.tsx` ne garde que la chrome et
 * le fournisseur de traductions. `lang` est fixé en dur, ce qui est exact tant
 * que `routing.locales` ne contient que le français — à faire remonter depuis
 * le segment le jour où une seconde langue arrive.
 */
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
}: Readonly<{ children: React.ReactNode }>) {
  // Set by `proxy.ts` alongside the CSP it generates for this request. Null on
  // any route the proxy's matcher skips, where no policy is sent either — so an
  // unstamped script there is not blocked.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="fr"
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
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
