import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from './config/env'
import { Database } from './types/supabase'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },

        setAll(cookiesToSet) {
          const cookieOptions = {
            path: '/',
            sameSite: 'lax' as const,
            secure: env.NODE_ENV === 'production',
          }

          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({
              name,
              value,
              ...options,
              ...cookieOptions,
            })
          })

          response = NextResponse.next({
            request,
          })

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set({
              name,
              value,
              ...options,
              ...cookieOptions,
            })
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  const publicRoute = isPublicRoute(pathname)

  if (!user && !publicRoute) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  if (user && publicRoute) {
    const isReset = request.nextUrl.searchParams.get('reset') === '1'

    const isPostAuthStep =
      isAuthHandler(pathname) ||
      isOnboardCompleteRoute(pathname) ||
      (isRouteMatch(pathname, '/set-password') &&
        (isReset || !user.user_metadata?.password_set))

    if (!isPostAuthStep) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)',
  ],
}

const PUBLIC_ROUTES = [
  '/sign-in',
  '/sign-up',
  '/onboard',
  '/set-password',
  '/auth',
  '/forgot-password',
] as const

function isRouteMatch(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => isRouteMatch(pathname, route))
}

function isAuthHandler(pathname: string) {
  return isRouteMatch(pathname, '/auth')
}

function isOnboardCompleteRoute(pathname: string) {
  return isRouteMatch(pathname, '/onboard/complete')
}
