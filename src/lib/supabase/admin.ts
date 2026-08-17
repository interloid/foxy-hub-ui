import 'server-only'

import { Database } from '@/types/supabase'
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }

  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function adminAuthRequest(path: string): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }

  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return fetch(`${url}/auth/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
}
