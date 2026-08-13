'use server'

import { logActivity } from '@/lib/activity'
import { getAccount } from '@/lib/dal'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

import { createWorkspaceSchema, firstIssue, slugSchema } from './schemas'
import { createCheckoutSession, CheckoutServiceError } from './services/billing'
import { findOwnedOrgId, sendInvitations } from './services/invitations'
import {
  buildSignupNext,
  isSlugAvailable,
  startWorkspaceSignup,
} from './services/workspace'
import type { ActionResult, InviteOutcome, TeamInvite } from './types'

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? ''

/** Step 1's live check on the workspace URL. */
export async function checkSlugAvailable(
  slug: string
): Promise<ActionResult<boolean>> {
  // The format rule lives in `slugSchema` — one regex, shared with the form's resolver.
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

/** Creates the account and, through the signup trigger, the workspace. */
export async function createWorkspace(
  input: unknown
): Promise<ActionResult<{ email: string }>> {
  const parsed = createWorkspaceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { fullName, email, agencyName, slug, planName, cycle } = parsed.data

  const supabase = await createClient()

  try {
    if (!(await isSlugAvailable(supabase, slug))) {
      return { ok: false, error: 'That workspace URL is already taken.' }
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
    console.error((err as Error).message)
    return { ok: false, error: 'Could not start signup. Try again.' }
  }

  return { ok: true, data: { email } }
}

/** Writes step 3's invitations AND emails them. */
export async function inviteTeam(
  orgId: string,
  invites: readonly TeamInvite[]
): Promise<ActionResult<InviteOutcome>> {
  if (invites.every((invite) => invite.email.trim().length === 0)) {
    return { ok: true, data: { created: 0, emailed: 0, failed: [] } }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return { ok: false, error: 'You need to be signed in to invite people.' }

  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error((err as Error).message)
    return {
      ok: false,
      error: 'Invitations are not configured on this server.',
    }
  }

  const data = await sendInvitations(supabase, admin, {
    orgId,
    invitedBy: user.id,
    invites,
    siteUrl: siteUrl(),
  })

  if (data.created > 0) {
    const account = await getAccount()
    const actor = account?.fullName?.trim() || 'Someone'
    const who =
      data.created === 1
        ? (invites.find((invite) => invite.email.trim())?.email.trim() ??
          'someone')
        : `${data.created} people`

    const roles = [
      ...new Set(invites.map((invite) => invite.role.toLowerCase())),
    ]
    const role = roles.length === 1 ? roles[0]! : null
    const as = role ? ` as ${/^[aeiou]/.test(role) ? 'an' : 'a'} ${role}` : ''

    await logActivity(supabase, {
      orgId,
      actorId: user.id,
      actorKind: 'member',
      type: 'members_invited',
      summary: `${actor} invited ${who}${as}`,
      payload: { created: data.created, emailed: data.emailed },
    })
  }

  return { ok: true, data }
}

/** Starts Stripe Checkout for the plan chosen on step 2. */
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
    // A missing plan row is the caller's mistake and is worth naming; anything else is ours.
    const message =
      err instanceof CheckoutServiceError &&
      (err.message.startsWith('No active') ? err.message : null)
    return { ok: false, error: message || 'Could not start checkout.' }
  }
}

export async function redeemPendingInvites(): Promise<
  ActionResult<InviteOutcome>
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const pending = user.user_metadata?.team_invites as TeamInvite[] | undefined
  if (!Array.isArray(pending) || pending.length === 0) {
    return { ok: true, data: { created: 0, emailed: 0, failed: [] } }
  }

  const orgId = await findOwnedOrgId(supabase)
  if (!orgId)
    return { ok: false, error: 'No workspace found for this account.' }

  const result = await inviteTeam(orgId, pending)
  await supabase.auth.updateUser({ data: { team_invites: null } })

  return result
}
