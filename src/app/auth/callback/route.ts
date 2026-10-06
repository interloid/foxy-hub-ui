import { siteConfig } from '@/config/site'
import { safeNextPath } from '@/lib/safe-redirect'
import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const isReset = searchParams.get('reset') === '1'
  const isForgot = searchParams.get('forgot') === '1'

  const safeNext = safeNextPath(next)
  const site = siteConfig.url

  const supabase = await createClient()

  let {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('Auth callback failed:', error.message)
      return NextResponse.redirect(new URL('/sign-in?error=invalid_link', site))
    }
    user = data.user
  }

  if (!user) {
    return NextResponse.redirect(new URL('/sign-in?error=missing_code', site))
  }

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
