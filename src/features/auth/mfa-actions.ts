'use server'

import { revalidatePath } from 'next/cache'

import { isDemoModeEnabled, serverEnv } from '@/config/env.server'
import { safeNextPath } from '@/lib/mfa'
import { createClient } from '@/lib/supabase/server'

import { resolveLanding } from './landing'
import { mfaCodeSchema } from './schemas'

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

export type TotpEnrollment = {
  factorId: string
  /** SVG data URL Supabase renders for the authenticator app to scan. */
  qrCode: string
  /** The same secret as text, for apps that cannot scan. */
  secret: string
}

const WRONG_CODE = 'That code is not right. Check your app and try again.'

function codeError(code: string | undefined): string {
  if (code === 'mfa_verification_failed' || code === 'invalid_credentials')
    return WRONG_CODE
  if (code === 'mfa_challenge_expired')
    return 'That code expired. Enter the newest one from your app.'
  if (code === 'over_request_rate_limit')
    return 'Too many attempts. Wait a few minutes and try again.'
  return 'Could not check that code. Try again.'
}

/** The account's one verified authenticator, if any. */
async function verifiedTotpFactorId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data } = await supabase.auth.mfa.listFactors()
  return data?.totp[0]?.id ?? null
}

/**
 * Step 1 of turning 2FA on: creates an UNVERIFIED factor and returns its QR code. Nothing
 * is enforced until `confirmTotpEnrollment` verifies a first code. Leftover unverified
 * factors from an abandoned attempt are removed first so they do not pile up.
 */
export async function startTotpEnrollment(): Promise<Result<TotpEnrollment>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Your session expired. Sign in again.' }

  // The shared demo login must never be lockable by whoever tries it next.
  if (
    isDemoModeEnabled() &&
    user.email?.toLowerCase() === serverEnv.DEMO_ACCOUNT_EMAIL?.toLowerCase()
  ) {
    return {
      ok: false,
      error: 'Two-factor authentication is not available on the demo account.',
    }
  }

  const { data: factors } = await supabase.auth.mfa.listFactors()
  if (factors?.totp.length) {
    return { ok: false, error: 'Two-factor authentication is already on.' }
  }
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    // Unique per attempt — Supabase rejects a duplicate friendly name.
    friendlyName: `Authenticator app ${Date.now()}`,
    issuer: 'Foxy HUB',
  })

  if (error || !data) {
    console.error('mfa enroll failed:', error?.code, error?.message)
    return { ok: false, error: 'Could not start two-factor setup.' }
  }

  return {
    ok: true,
    data: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    },
  }
}

/**
 * Step 2: the first correct code verifies the factor — 2FA is on from here — and upgrades
 * THIS session to aal2, so the user is not asked again straight away.
 */
export async function confirmTotpEnrollment(
  factorId: string,
  code: string
): Promise<Result> {
  const parsed = mfaCodeSchema.safeParse(code)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: parsed.data,
  })

  if (error) {
    console.error('mfa enroll verify failed:', error.code, error.message)
    return { ok: false, error: codeError(error.code) }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Closing the setup dialog before confirming removes the half-made factor. */
export async function cancelTotpEnrollment(factorId: string): Promise<void> {
  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.listFactors()
  const factor = data?.all.find((item) => item.id === factorId)
  if (factor?.status === 'unverified') {
    await supabase.auth.mfa.unenroll({ factorId })
  }
}

/**
 * Turning 2FA off needs a CURRENT code, so an unattended signed-in laptop cannot quietly
 * disable it. Verifying first also gives the aal2 session Supabase demands for removing a
 * verified factor.
 */
export async function disableTotp(code: string): Promise<Result> {
  const parsed = mfaCodeSchema.safeParse(code)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const factorId = await verifiedTotpFactorId(supabase)
  if (!factorId)
    return { ok: false, error: 'Two-factor authentication is already off.' }

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: parsed.data,
  })
  if (verifyError) {
    console.error(
      'mfa disable verify failed:',
      verifyError.code,
      verifyError.message
    )
    return { ok: false, error: codeError(verifyError.code) }
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) {
    console.error('mfa unenroll failed:', error.code, error.message)
    return { ok: false, error: 'Could not turn two-factor authentication off.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * The code step after signing in: upgrades this session from aal1 to aal2, then says where
 * to go. For a plain sign-in (`next` is `/`) that is the workspace — resolved only NOW,
 * because memberships were hidden from the aal1 session, and a deactivated user is turned
 * away here instead of at the password step.
 */
export async function verifyMfaSignIn(
  code: string,
  next: string
): Promise<Result<{ redirectTo: string }>> {
  const parsed = mfaCodeSchema.safeParse(code)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const destination = safeNextPath(next)
  const factorId = await verifiedTotpFactorId(supabase)

  if (factorId) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: parsed.data,
    })

    if (error) {
      console.error('mfa sign-in verify failed:', error.code, error.message)
      return { ok: false, error: codeError(error.code) }
    }
  }

  revalidatePath('/', 'layout')

  if (destination !== '/')
    return { ok: true, data: { redirectTo: destination } }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Your session expired. Sign in again.' }

  const landing = await resolveLanding(supabase, user.id)
  if (!landing.ok) return landing
  return { ok: true, data: { redirectTo: landing.redirectTo } }
}

/** "Use a different account" on the code page — ends THIS session only. */
export async function abandonMfaSignIn(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) console.error('abandon mfa sign-in failed:', error.message)
  revalidatePath('/', 'layout')
}
