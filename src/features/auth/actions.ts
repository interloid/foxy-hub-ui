'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { siteConfig } from '@/config/site'
import { createClient } from '@/lib/supabase/server'
import { toast } from 'sonner'
import {
  changePasswordSchema,
  firstIssue,
  resetRequestSchema,
  setPasswordSchema,
  signInSchema,
} from './schemas'

export type AuthResult = { ok: true } | { ok: false; error: string }

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
    return {
      ok: false,
      error: 'No workspace found for this account.',
    }
  }

  redirect(`/${orgSlug}`)
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
    toast.error(`password reset failed:, ${error.message}`)
  }
  return { ok: true }
}

export async function signInAsDemo(): Promise<AuthResult> {
  const email = process.env.DEMO_ACCOUNT_EMAIL
  const password = process.env.DEMO_ACCOUNT_PASSWORD

  if (!email || !password) {
    return { ok: false, error: 'The demo account is not configured.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.error('demo sign-in failed:', error.message)
    return { ok: false, error: 'The demo account is unavailable right now.' }
  }
  redirect('/')
}

export async function signOut(): Promise<never> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) console.error('sign-out failed:', error.message)

  revalidatePath('/', 'layout')
  redirect('/sign-in')
}

export async function setPassword(
  password: string,
  confirm: string
): Promise<AuthResult> {
  const parsed = setPasswordSchema.safeParse({ password, confirm })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return { ok: false, error: 'Your link has expired. Request a new one.' }

  const { error } = await supabase.auth.updateUser({
    password,
    data: { password_set: true },
  })

  if (error) {
    console.error('set password failed:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function getSlug() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('slug')
    .single()
  if (error) return { ok: false, error: error.message }

  return { ok: true, slug: data.slug }
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
