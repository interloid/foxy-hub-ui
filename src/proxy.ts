import { createServerClient } from '@supabase/ssr'
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
  userAgent,
} from 'next/server'
import { env } from './config/env'
import {
  formatLastActive,
  inactivityLimitMs,
  inactivityTimeoutOf,
  LAST_ACTIVE_COOKIE,
  LAST_ACTIVE_TOUCH_MS,
  parseLastActive,
} from './lib/inactivity'
import { hasVerifiedFactor, MFA_VERIFY_PATH, safeNextPath } from './lib/mfa'
import { Database } from './types/supabase'

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // Weekly digest unsubscribe works without signing in (the link is signed) and must not
  // be redirected to /sign-in or the dashboard — see app/api/digest/unsubscribe.
  if (isRouteMatch(request.nextUrl.pathname, '/api/digest/unsubscribe')) {
    return NextResponse.next({ request })
  }

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

  // Two-factor: a user with a verified authenticator whose session has not passed the
  // code (aal1 — password, magic link, invite or reset link) reaches NOTHING but the code
  // page. This is the enforcement; the page itself is only the way through. `/auth/*`
  // stays open so the email-link handlers can create the session in the first place.
  const claims = user ? await currentClaims(supabase) : null
  const needsMfa = hasVerifiedFactor(user) && claims?.aal !== 'aal2'
  const onMfaPage = isRouteMatch(pathname, MFA_VERIFY_PATH)

  if (needsMfa && !onMfaPage && !isAuthHandler(pathname)) {
    const verify = new URL(MFA_VERIFY_PATH, request.url)
    verify.searchParams.set(
      'next',
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    )
    return withCookies(NextResponse.redirect(verify), response)
  }

  if (user && onMfaPage && !needsMfa) {
    const next = safeNextPath(request.nextUrl.searchParams.get('next'))
    return withCookies(
      NextResponse.redirect(new URL(next, request.url)),
      response
    )
  }

  if (user && !publicRoute) {
    const limit = inactivityLimitMs(inactivityTimeoutOf(user.user_metadata))
    const sessionId = claims?.sessionId ?? null
    const now = Date.now()
    const last = parseLastActive(request.cookies.get(LAST_ACTIVE_COOKIE)?.value)
    // A timestamp from another session is not this session's activity.
    const lastAt = last && last.sessionId === sessionId ? last.at : null

    if (limit !== null && lastAt !== null && now - lastAt > limit) {
      // `local` ends this session only; the user's other devices keep theirs.
      await supabase.auth.signOut({ scope: 'local' })

      const expired = NextResponse.redirect(
        new URL('/sign-in?error=session_expired', request.url)
      )
      // Carry the cleared auth cookies `signOut` wrote onto `response`.
      withCookies(expired, response)
      expired.cookies.delete(LAST_ACTIVE_COOKIE)
      return expired
    }

    if (sessionId && (lastAt === null || now - lastAt > LAST_ACTIVE_TOUCH_MS)) {
      // Same cadence (≤ once a minute per device) refreshes the Devices list entry, off
      // the request's critical path. `touch_my_session` throttles its own writes too.
      if (!userAgent(request).isBot) {
        event.waitUntil(recordDevice(supabase, request))
      }

      response.cookies.set(
        LAST_ACTIVE_COOKIE,
        formatLastActive(sessionId, now),
        {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: env.NODE_ENV === 'production',
          // Outlives the longest limit, so "After 7 days" can still be measured.
          maxAge: 30 * 24 * 60 * 60,
        }
      )
    }
  }

  if (user && publicRoute) {
    const isReset = request.nextUrl.searchParams.get('reset') === '1'

    const isPostAuthStep =
      isAuthHandler(pathname) ||
      onMfaPage ||
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

/**
 * `session_id` and `aal` from the access token in the cookies. Safe to read unverified
 * HERE because `getUser()` above has already validated this same token with the Auth
 * server; `session_id` scopes the inactivity cookie and `aal` says whether this session
 * passed the two-factor code.
 */
async function currentClaims(
  supabase: ReturnType<typeof createServerClient<Database>>
): Promise<{ sessionId: string | null; aal: string | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const payload = session?.access_token.split('.')[1]
  if (!payload) return { sessionId: null, aal: null }

  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const claims = JSON.parse(json) as { session_id?: unknown; aal?: unknown }
    return {
      sessionId:
        typeof claims.session_id === 'string' ? claims.session_id : null,
      aal: typeof claims.aal === 'string' ? claims.aal : null,
    }
  } catch {
    return { sessionId: null, aal: null }
  }
}

/** A redirect built after `getUser()` must carry any refreshed auth cookies with it. */
function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  return target
}

/**
 * Upserts this session's row in `user_sessions` for Settings → Security → Devices. The
 * browser's own User-Agent and Vercel's geo headers are the only reliable source:
 * Supabase records the server that signed the user in, not their device. City and
 * country only — the IP is never sent or stored. Locally there are no geo headers.
 */
async function recordDevice(
  supabase: ReturnType<typeof createServerClient<Database>>,
  request: NextRequest
): Promise<void> {
  const header = (name: string) => {
    const value = request.headers.get(name)
    if (!value) return ''
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  const { error } = await supabase.rpc('touch_my_session', {
    p_user_agent: request.headers.get('user-agent') ?? '',
    p_city: header('x-vercel-ip-city'),
    p_country: header('x-vercel-ip-country'),
  })
  if (error) console.error('record device failed:', error.message)
}
