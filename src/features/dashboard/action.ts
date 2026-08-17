import 'server-only'

import { createClient } from '@/lib/supabase/server'

export async function getUserName() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'Invalid token.' }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  if (error) {
    return { ok: false, error: error.message }
  }

  const name = data.full_name
    ? data.full_name
    : user.email
      ? user.email.split('@')[0]
      : undefined

  return { ok: true, name }
}
