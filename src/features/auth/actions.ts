'use server'

import { isDemoModeEnabled, serverEnv } from '@/config/env.server'
import { siteConfig } from '@/config/site'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  changePasswordSchema,
  firstIssue,
  resetRequestSchema,
  setPasswordSchema,
  signInSchema,
} from './schemas'

export type AuthResult =
  | { ok: true; redirectTo?: string; role?: string }
  | { ok: false; error: string }

export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  const parsed = signInSchema.safeParse({ email, password })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { email: address, password: secret } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: address,
    password: secret,
  })

  if (error) {
    return { ok: false, error: 'That email and password do not match.' }
  }

  const userId = data.user.id
  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('organizations(slug)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  const orgSlug = (
    membership?.organizations as unknown as { slug: string } | null
  )?.slug

  if (membershipError || !orgSlug) {
    return { ok: true, redirectTo: '/onboard' }
  }

  return { ok: true, redirectTo: `/${orgSlug}` }
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const parsed = resetRequestSchema.safeParse({ email })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { email: address } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(address, {
    redirectTo: `${siteConfig.url}/auth/callback?reset=1`,
  })

  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function signInAsDemo(): Promise<AuthResult> {
  if (!isDemoModeEnabled()) {
    return { ok: false, error: 'The demo account is not configured.' }
  }

  const email = serverEnv.DEMO_ACCOUNT_EMAIL!
  const password = serverEnv.DEMO_ACCOUNT_PASSWORD!

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.error('demo sign-in failed:', error.message)
    return { ok: false, error: 'The demo account is unavailable right now.' }
  }

  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      // Log session errors, but do not block navigation if session is missing
      console.error('sign-out failed:', error.message)
    }
  } catch (err) {
    console.error('Unexpected error during sign-out:', err)
  }
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function setPassword(
  password: string,
  confirm: string
): Promise<AuthResult> {
  const parsed = setPasswordSchema.safeParse({ password, confirm })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const supabase = await createClient()

  const { data: updateData, error: updateError } =
    await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    })

  if (updateError) {
    return { ok: false, error: updateError.message }
  }
  const userId = updateData.user?.id

  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()
  if (membershipError) {
    return { ok: false, error: membershipError.message }
  }
  return { ok: true, role: membership?.role ?? undefined }
}

export async function changePassword(
  current: string,
  password: string,
  confirm: string
): Promise<AuthResult> {
  const parsed = changePasswordSchema.safeParse({ current, password, confirm })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email)
    return { ok: false, error: 'Your session expired. Sign in again.' }

  if (!user.user_metadata?.password_set) {
    return {
      ok: false,
      error:
        'This account has no password yet. Use “Forgot password” on the sign-in page.',
    }
  }

  const { error: reauth } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  })
  if (reauth) {
    console.error('re-auth before password change failed:', reauth.message)
    return { ok: false, error: 'That current password is not correct.' }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })

  if (error) {
    console.error('change password failed:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function getUserDailyCapacityAndLoggedMinutes(
  userId: string,
  orgSlug: string,
  workDate: string
) {
  const supabase = await createClient()

  // 1. Fetch organization daily capacity (default to 8h if missing)
  const { data: orgData } = await supabase
    .from('organizations')
    .select('daily_capacity_hours, id')
    .eq('slug', orgSlug)
    .maybeSingle()

  const dailyCapacityMinutes = (orgData?.daily_capacity_hours ?? 8) * 60

  if (!orgData) {
    return { dailyCapacityMinutes: 8 * 60, alreadyLoggedMinutes: 0 }
  }

  const { data: entries } = await supabase
    .from('time_entries')
    .select('duration_minutes, projects!inner(org_id)')
    .eq('user_id', userId)
    .eq('work_date', workDate)
    .eq('projects.org_id', orgData?.id) // Optional if scoped by orgId or RLS

  const alreadyLoggedMinutes = (entries ?? []).reduce(
    (sum, entry) => sum + (entry.duration_minutes ?? 0),
    0
  )

  return { dailyCapacityMinutes, alreadyLoggedMinutes }
}
