import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

import { siteConfig } from '@/config/site'
import { safeNextPath } from '@/lib/safe-redirect'
import { createClient } from '@/lib/supabase/server'

/**
 * Email links carry `next` either as a path or as a full URL on this site (Supabase's
 * `{{ .RedirectTo }}`). A full URL is reduced to its path; either way the result goes
 * through `safeNextPath`, so neither form can point at another site.
 */
function toSafePath(next: string | null, site: string): string {
  if (!next) return '/'

  if (next.startsWith('/')) return safeNextPath(next)

  try {
    const url = new URL(next)
    if (url.origin === new URL(site).origin) {
      return safeNextPath(`${url.pathname}${url.search}`)
    }
  } catch {
    // Not a parseable URL — fall through to the safe default.
  }

  return '/'
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const site = siteConfig.url
  const safeNext = toSafePath(searchParams.get('next'), site)

  const supabase = await createClient()

  if (type === 'email_change') {
    const result = new URL(safeNext, site)

    if (!tokenHash) {
      result.searchParams.set('email_change', 'failed')
      return NextResponse.redirect(result)
    }

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (error) console.error('email change confirm failed:', error.message)
    result.searchParams.set('email_change', error ? 'failed' : 'done')
    return NextResponse.redirect(result)
  }

  // 1. Check if the user already has an active session from a previous click
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  if (currentUser) {
    // User is already logged in. If they haven't set their password yet, force set-password page.
    if (!currentUser.user_metadata?.password_set) {
      return NextResponse.redirect(
        new URL(`/set-password?next=${encodeURIComponent(safeNext)}`, site)
      )
    }
    return NextResponse.redirect(
      new URL('/sign-in?error=link_already_used', site)
    )
  }

  // 2. Validate parameters for non-authenticated requests
  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid_link', site))
  }

  // 3. Verify OTP for fresh tokens
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })

  if (error) {
    console.error('confirm failed:', error.message)
    return NextResponse.redirect(new URL('/sign-in?error=link_expired', site))
  }

  // 4. Check if password set flag is missing after fresh verification
  if (!data.user?.user_metadata?.password_set) {
    return NextResponse.redirect(
      new URL(`/set-password?next=${encodeURIComponent(safeNext)}`, site)
    )
  }

  return NextResponse.redirect(new URL(safeNext, site))
}
