import 'server-only'

import { Database } from '@/types/supabase'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/config/env'
import { serverEnv } from '@/config/env.server'

export function createAdminClient() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY

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
