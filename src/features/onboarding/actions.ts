'use server'

import { siteConfig } from '@/config/site'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

import { rateLimit } from '@/lib/rate-limit'
import { ONBOARD_TAKEN } from './data'
import {
  createWorkspaceSchema,
  emailSchema,
  firstIssue,
  slugSchema,
} from './schemas'
import { CheckoutServiceError, createCheckoutSession } from './services/billing'
import { findOwnedOrgId } from './services/invitations'
import {
  buildSignupNext,
  isSlugAvailable,
  startWorkspaceSignup,
} from './services/workspace'
import type { ActionResult } from './types'

const siteUrl = () => siteConfig.url

export async function checkSlugAvailable(
  slug: string
): Promise<ActionResult<boolean>> {
  const parsed = slugSchema.safeParse({ slug })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const supabase = await createClient()
  try {
    return { ok: true, data: await isSlugAvailable(supabase, parsed.data.slug) }
  } catch (err) {
    console.error((err as Error).message)
    return { ok: false, error: 'Could not check that URL. Try again.' }
  }
}

export async function checkEmailAvailable(
  email: string
): Promise<ActionResult<boolean>> {
  const parsed = emailSchema.safeParse({ email })
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const headerList = await headers()
  const forwardedFor = headerList.get('x-forwarded-for')
  const ip = forwardedFor
    ? forwardedFor.split(',')[0]!.trim()
    : (headerList.get('x-real-ip') ?? 'anonymous')

  const isAllowed = await rateLimit(`check-email:${ip}`, {
    limit: 5,
    windowMs: 60 * 1000,
  })

  if (!isAllowed) {
    return { ok: false, error: 'Too many requests. Please try again later.' }
  }

  try {
    const admin = createAdminClient()
    const { data: emailExists, error } = await admin.rpc('check_email_exists', {
      p_email: parsed.data.email,
    })

    if (error) {
      console.error(error.message)
      return { ok: false, error: 'Could not check that email. Try again.' }
    }

    return { ok: true, data: !emailExists }
  } catch (err) {
    console.error((err as Error).message)
    return { ok: false, error: 'Could not check that email. Try again.' }
  }
}

export async function createWorkspace(
  input: unknown
): Promise<ActionResult<{ email: string }>> {
  const parsed = createWorkspaceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { fullName, email, agencyName, slug, planName, cycle } = parsed.data

  const supabase = await createClient()

  try {
    if (!(await isSlugAvailable(supabase, slug))) {
      return { ok: false, error: ONBOARD_TAKEN.slug }
    }

    await startWorkspaceSignup(supabase, {
      fullName,
      email,
      agencyName,
      slug,
      invites: (parsed.data.invites ?? []).filter(
        (invite) => invite.email.length > 0
      ),
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(
        buildSignupNext(planName, cycle)
      )}`,
    })
  } catch (err) {
    const message = (err as Error).message || ''
    console.error(message)

    if (
      message.includes('User already registered') ||
      message.includes('already exists')
    ) {
      return { ok: false, error: ONBOARD_TAKEN.email }
    }

    return { ok: false, error: 'Could not start signup. Try again.' }
  }

  return { ok: true, data: { email } }
}

export async function startPlanCheckout(
  planName: string,
  cycle: 'monthly' | 'yearly'
): Promise<ActionResult<{ url: string | null; message?: string }>> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return { ok: false, error: 'You need to be signed in to choose a plan.' }

  const orgId = await findOwnedOrgId(supabase)
  if (!orgId)
    return { ok: false, error: 'No workspace found for this account.' }

  try {
    const result = await createCheckoutSession(supabase, {
      planName,
      cycle,
      orgId,
      returnUrl: siteUrl(),
    })
    return { ok: true, data: result }
  } catch (err) {
    console.error('create-checkout failed:', (err as Error).message)
    const message =
      err instanceof CheckoutServiceError &&
      (err.message.startsWith('No active') ? err.message : null)
    return { ok: false, error: message || 'Could not start checkout.' }
  }
}
