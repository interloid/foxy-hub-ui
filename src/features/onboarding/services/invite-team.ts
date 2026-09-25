import 'server-only'

import { z } from 'zod'

import { siteConfig } from '@/config/site'
import { logActivity } from '@/lib/activity'
import { getAccount, isAdminRole } from '@/lib/dal'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

import type { ActionResult, InviteOutcome, TeamInvite } from '../types'
import { sendInvitations } from './invitations'

/**
 * Creates invitation rows and emails them, for a workspace the signed-in user administers.
 *
 * NOT a server action (RISK-004). It used to be exported from the `'use server'`
 * onboarding/actions.ts, which made it a public endpoint any admin could call directly —
 * skipping the seat limit, the email checks and the one-invite-at-a-time flow that
 * `inviteMemberAction` enforces. It is now server-only and reachable only through the
 * actions that validate first (features/people/actions.ts). `server-only` fails the build
 * if a client component ever imports it.
 */

const MAX_INVITES_PER_CALL = 10

const siteUrl = () => siteConfig.url

export async function inviteTeam(
  orgId: string,
  invites: readonly TeamInvite[]
): Promise<ActionResult<InviteOutcome>> {
  if (invites.every((invite) => invite.email.trim().length === 0)) {
    return { ok: true, data: { created: 0, emailed: 0, failed: [] } }
  }

  // Callers validate each invite and check seats first; these limits are a backstop so a
  // future caller that forgets cannot send a flood of emails from this domain.
  if (invites.length > MAX_INVITES_PER_CALL) {
    return {
      ok: false,
      error: `Invite at most ${MAX_INVITES_PER_CALL} people at a time.`,
    }
  }
  if (
    invites.some(
      (invite) =>
        invite.email.trim().length > 0 &&
        !z.email().safeParse(invite.email.trim()).success
    )
  ) {
    return { ok: false, error: 'One of those email addresses is not valid.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'You need to be signed in to invite people.' }
  }

  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select(
      `role,
      organization:organizations (
        slug
      )`
    )
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership || !isAdminRole(membership.role)) {
    return {
      ok: false,
      error:
        'You do not have permission to invite members to this organization.',
    }
  }

  let admin: ReturnType<typeof createAdminClient>
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
    orgSlug: membership.organization.slug,
  })

  if (data.created > 0) {
    const account = await getAccount(membership.organization.slug)
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
