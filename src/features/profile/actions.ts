'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { fullNameSchema } from './schemas'

export type ProfileResult =
  { ok: true; fullName: string } | { ok: false; error: string }

export async function updateFullName(fullName: string): Promise<ProfileResult> {
  const parsed = fullNameSchema.safeParse({ fullName })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the name and try again.',
    }
  }

  const session = await verifySession()
  if (!session)
    return { ok: false, error: 'Your session expired. Sign in again.' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: session.id, full_name: parsed.data.fullName },
      { onConflict: 'id' }
    )
    .select('full_name')
    .maybeSingle()

  if (error) {
    console.error('update full name failed:', error.message)
    return { ok: false, error: 'Could not save your name.' }
  }

  if (!data) {
    console.error('update full name affected no rows for user', session.id)
    return { ok: false, error: 'Could not save your name.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, fullName: data.full_name ?? parsed.data.fullName }
}
