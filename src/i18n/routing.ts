import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
 
// English is deliberately absent. `messages/en.json` exists but nothing in the
// app ever calls useTranslations/getTranslations — every string is written
// inline in French — so shipping an `en` locale served French text under an
// English URL. `messages/en.json` is kept so re-enabling is a one-line change
// once the copy is actually externalised and translated.
export const routing = defineRouting({
  locales: ['fr'],
  defaultLocale: 'fr'
});
 
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
