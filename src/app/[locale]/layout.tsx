import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Navbar } from '@/components/shared/Navbar';
import { BottomNav } from '@/components/shared/BottomNav';
import { Footer } from '@/components/shared/Footer';

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Madame Dacosta Services - Personnel de Maison",
  description: "Trouvez le personnel de maison idéal près de chez vous (Nounous, Chauffeurs, Cuisiniers...)",
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

  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
