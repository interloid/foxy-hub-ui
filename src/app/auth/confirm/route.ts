import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

import { siteConfig } from '@/config/site'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  const site = siteConfig.url

  const supabase = await createClient()

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
    // If password is set and link clicked again, send to sign-in with expired link error
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
