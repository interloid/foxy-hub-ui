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

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid_link', site))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })

  if (error) {
    const errorUrl = new URL('/sign-in', site)
    errorUrl.searchParams.set('error', 'invalid_link')
    errorUrl.searchParams.set('error_description', error.message)
    return NextResponse.redirect(errorUrl)
  }

  if (!data.user?.user_metadata?.password_set) {
    return NextResponse.redirect(
      new URL(`/set-password?next=${encodeURIComponent(safeNext)}`, site)
    )
  }

  return NextResponse.redirect(new URL(safeNext, site))
}
