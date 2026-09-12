'use server'

import { isDemoModeEnabled, serverEnv } from '@/config/env.server'
import { siteConfig } from '@/config/site'
import { decodePassword } from '@/lib/password-encoding'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
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
  encodePassword: string
): Promise<AuthResult> {
  const password = decodePassword(encodePassword)
  const parsed = signInSchema.safeParse({ email, password })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { email: address, password: secret } = parsed.data

  const headerList = await headers()
  const rawIp = headerList.get('x-forwarded-for')
  const ip = rawIp?.split(',')[0]?.trim() ?? 'anonymous'

  const isAllowed = await rateLimit(`sign-in:${ip}:${address}`, {
    limit: 5,
    windowMs: 60_000,
  })

  if (!isAllowed) {
    return {
      ok: false,
      error: 'Too many login attempts. Please try again in a minute.',
    }
  }

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
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const orgSlug = (membership?.organizations as { slug: string } | null)?.slug
  if (membershipError || !orgSlug) {
    return { ok: true, redirectTo: '/onboard' }
  }

  return { ok: true, redirectTo: `/${orgSlug}` }
}

export async function sendPasswordReset(
  email: string,
  forgotPassword?: boolean
): Promise<AuthResult> {
  const parsed = resetRequestSchema.safeParse({ email })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { email: address } = parsed.data

  const queryParams = new URLSearchParams({ reset: '1' })
  if (forgotPassword) {
    queryParams.set('forgot', '1')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(address, {
    redirectTo: `${siteConfig.url}/auth/callback?${queryParams.toString()}`,
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
  encodePassword: string,
  encodeConfirm: string
): Promise<AuthResult> {
  const decodedPassword = decodePassword(encodePassword)
  const decodedConfirm = decodePassword(encodeConfirm)

  const parsed = setPasswordSchema.safeParse({
    password: decodedPassword,
    confirm: decodedConfirm,
  })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const supabase = await createClient()

  const { data: updateData, error: updateError } =
    await supabase.auth.updateUser({
      password: decodedPassword,
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
    .limit(1)
  if (membershipError) {
    return { ok: false, error: membershipError.message }
  }
  return { ok: true, role: membership?.[0]?.role ?? undefined }
}

export async function changePassword(
  encodeCurrent: string,
  encodePassword: string,
  encodeConfirm: string
): Promise<AuthResult> {
  const parsed = changePasswordSchema.safeParse({
    current: decodePassword(encodeCurrent),
    password: decodePassword(encodePassword),
    confirm: decodePassword(encodeConfirm),
  })

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return {
      ok: false,
      error: 'Your session expired. Sign in again.',
    }
  }

  if (!user.user_metadata?.password_set) {
    return {
      ok: false,
      error:
        'This account has no password yet. Use “Forgot password” on the sign-in page.',
    }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    current_password: parsed.data.current,
  })

  if (error) {
    console.error('change password failed:', error.message)

    return {
      ok: false,
      error:
        error.code === 'same_password'
          ? 'Your new password must be different from your current password.'
          : error.code === 'invalid_credentials'
            ? 'That current password is not correct.'
            : error.message,
    }
  }

  return { ok: true }
}
