import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handleI18n = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const response = handleI18n(request);

  // Refresh the Supabase auth session so server components always see valid
  // tokens. Skipped when Supabase isn't configured (e.g. fresh clone without
  // .env.local) so the rest of the app keeps working.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });
    await supabase.auth.getUser();
  }

  return response;
}

export const config = {
  // Keep in step with routing.locales — a locale listed here but absent there
  // gets matched by the middleware and then has nowhere to route to.
  matcher: ['/', '/(fr)/:path*'],
};
