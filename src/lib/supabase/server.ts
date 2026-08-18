import 'server-only'

import { env } from '@/config/env'
import { Database } from '@/types/supabase'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, {
                ...options,
                path: '/',
                sameSite: 'lax',
                secure: env.NODE_ENV === 'production',
              })
            }
          } catch {
            // Server Components cannot set cookies.
            // proxy.ts handles session refresh and cookie persistence.
          }
        },
      },
    }
  )
}
