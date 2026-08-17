import { NextResponse, type NextRequest } from 'next/server'
import { siteConfig } from '@/config/site'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const isReset = searchParams.get('reset') === '1'

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  const site = siteConfig.url

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=missing_code', site))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Auth callback failed:', error.message)
    return NextResponse.redirect(new URL('/sign-in?error=invalid_link', site))
  }

  if (isReset || !data.user?.user_metadata?.password_set) {
    const target = `/set-password?next=${encodeURIComponent(safeNext)}${isReset ? '&reset=1' : ''}`
    return NextResponse.redirect(new URL(target, site))
  }

  return NextResponse.redirect(new URL(safeNext, site))
}
