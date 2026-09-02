import { siteConfig } from '@/config/site'
import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const isReset = searchParams.get('reset') === '1'
  const isForgot = searchParams.get('forgot') === '1'

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  const site = siteConfig.url

  const supabase = await createClient()

  // 1. Get current session if user is already logged in
  let {
    data: { user },
  } = await supabase.auth.getUser()

  // 2. If no session but code exists, exchange code for session
  if (!user && code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('Auth callback failed:', error.message)
      return NextResponse.redirect(new URL('/sign-in?error=invalid_link', site))
    }
    user = data.user
  }

  // 3. If still no user and no valid code, redirect to sign-in
  if (!user) {
    return NextResponse.redirect(new URL('/sign-in?error=missing_code', site))
  }

  // 4. Check if password needs to be set
  if (isReset || isForgot || !user.user_metadata?.password_set) {
    const params = new URLSearchParams({ next: safeNext })
    if (isReset) params.set('reset', '1')
    if (isForgot) params.set('forgot', '1')

    return NextResponse.redirect(
      new URL(`/set-password?${params.toString()}`, request.url)
    )
  }

  return NextResponse.redirect(new URL(safeNext, site))
}
