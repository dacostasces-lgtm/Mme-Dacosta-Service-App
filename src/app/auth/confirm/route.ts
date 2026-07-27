import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPathname, routing } from '@/i18n/routing'
import { dashboardPathFor, type UserRole } from '@/lib/auth/dal'

// Lands here from the Supabase confirmation email. Supports both link styles:
// `token_hash` + `type` (custom email template) and `code` (default PKCE template).
// This route sits outside `[locale]`, so the locale rides along as a query param
// set at signup — falling back to the default locale for hand-built links.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')

  const requestedLocale = searchParams.get('locale')
  const locale = routing.locales.includes(requestedLocale as (typeof routing.locales)[number])
    ? (requestedLocale as (typeof routing.locales)[number])
    : routing.defaultLocale

  // Supabase redirects here with its own error params when it rejects the link
  // before we ever see a token — an expired link being by far the common case.
  // Without this branch the route falls through to the generic "Lien invalide",
  // which tells the user their link is broken when it merely aged out.
  const errorCode = searchParams.get('error_code')
  if (errorCode || searchParams.get('error')) {
    const message =
      errorCode === 'otp_expired'
        ? 'Ce lien de confirmation a expiré. Demandez-en un nouveau pour activer votre compte.'
        : searchParams.get('error_description') ?? 'Lien de confirmation refusé.'

    const loginPath = getPathname({ href: '/login', locale })
    return NextResponse.redirect(
      new URL(`${loginPath}?error=${encodeURIComponent(message)}`, request.url)
    )
  }

  const supabase = await createClient()

  let errorMessage: string | null = null
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    errorMessage = error?.message ?? null
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    errorMessage = error?.message ?? null
  } else {
    errorMessage = 'Lien invalide'
  }

  if (errorMessage) {
    const loginPath = getPathname({ href: '/login', locale })
    return NextResponse.redirect(
      new URL(`${loginPath}?error=${encodeURIComponent(errorMessage)}`, request.url)
    )
  }

  const { data } = await supabase.auth.getUser()
  const role = (data.user?.user_metadata?.role ?? 'candidate') as UserRole
  const destination = getPathname({ href: dashboardPathFor(role), locale })
  return NextResponse.redirect(new URL(destination, request.url))
}
