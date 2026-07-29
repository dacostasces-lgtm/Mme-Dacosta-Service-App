import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Navbar } from '@/components/shared/Navbar';
import { BottomNav } from '@/components/shared/BottomNav';
import { ServiceWorker } from '@/components/shared/ServiceWorker';
import { Footer } from '@/components/shared/Footer';

/**
 * Chrome du site : navigation, pied de page, traductions.
 *
 * html/body, les polices et les métadonnées vivent dans `app/layout.tsx`. Ils
 * étaient ici, ce qui faisait de ce fichier le layout racine de fait — et
 * empêchait Next de composer une 404 pour un `notFound()` levé dans une page,
 * qui renvoyait alors un corps vide.
 */
export default async function LocaleLayout({
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
    <NextIntlClientProvider messages={messages}>
      {/* pt-16 clears the fixed Navbar; the pb reserves the mobile tab bar's
          row (plus the safe-area inset) so the Footer stays reachable. The
          wrapper carries them rather than <body>, which now sits one level up
          and is shared with the 404 page. */}
      <div className="flex-1 flex flex-col pt-16 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <Navbar />
        <main className="flex-1 flex flex-col">{children}</main>
        <Footer />
        <BottomNav />
        <ServiceWorker />
      </div>
    </NextIntlClientProvider>
  );
}
