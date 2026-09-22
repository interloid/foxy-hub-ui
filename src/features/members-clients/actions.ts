'use server'

import { revalidatePath } from 'next/cache'

import { inviteTeam } from '@/features/onboarding/actions'
import type { ActionResult, InviteOutcome } from '@/features/onboarding/types'
import { getWorkspace } from '@/lib/dal'
import { isAdminRole, type InvitableStaffRole } from '@/lib/role'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

import { getClientUsage, getSeatUsage } from './queries'

export async function inviteMemberAction(
  orgSlug: string,
  input: { email: string; role: InvitableStaffRole; fullName?: string }
): Promise<ActionResult<InviteOutcome>> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (!isAdminRole(workspace.role)) {
    return { ok: false, error: 'Only an owner or admin can invite teammates.' }
  }

  const seats = await getSeatUsage(workspace.id)
  if (seats.maxMembers !== null && seats.used >= seats.maxMembers) {
    return {
      ok: false,
      error: `Your ${seats.planName} plan covers ${seats.maxMembers} ${
        seats.maxMembers === 1 ? 'seat' : 'seats'
      } and all of them are taken. Upgrade the plan or deactivate someone first.`,
    }
  }

  const supabase = await createClient()
  const { data: emailExists, error: emailError } = await supabase.rpc(
    'check_email_exists',
    { p_email: input.email }
  )

  if (emailError) {
    return { ok: false, error: 'Could not check that email. Try again.' }
  }

  if (emailExists) {
    return {
      ok: false,
      error: 'That address already has an account — ask them to sign in.',
    }
  }

  const result = await inviteTeam(workspace.id, [
    { email: input.email, role: input.role, fullName: input.fullName },
  ])

  if (result.ok) revalidatePath(`/${orgSlug}/members-clients`)
  return result
}

export async function createClientAction(
  orgSlug: string,
  input: {
    name: string
    contactName?: string
    contactEmail?: string
    invite?: boolean
    projectId?: string
  }
): Promise<
  ActionResult<{
    invited: boolean
    inviteError?: string
    reactivated?: boolean
  }>
> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (!isAdminRole(workspace.role)) {
    return { ok: false, error: 'Only an owner or admin can add clients.' }
  }

  if (!input.name.trim()) {
    return { ok: false, error: 'Client name is required.' }
  }

  const usage = await getClientUsage(workspace.id)
  if (usage.maxClients !== null && usage.used >= usage.maxClients) {
    return {
      ok: false,
      error: `Your ${usage.planName} plan covers ${usage.maxClients} ${
        usage.maxClients === 1 ? 'client' : 'clients'
      } and all of them are in use. Upgrade the plan or remove one first.`,
    }
  }

  const supabase = await createClient()
  const name = input.name.trim()
  const contactName = input.contactName?.trim() || null
  const contactEmail = input.contactEmail?.trim() || null

  // A deactivated company keeps its row so old projects and invoices keep their name, and
  // `unique (org_id, name)` means adding it back would collide with that row. Adding back a
  // client you deactivated IS reactivating them, so do that rather than refuse the name.
  const { data: existing } = await supabase
    .from('clients')
    .select('id, status, contact_name, contact_email')
    .eq('org_id', workspace.id)
    .eq('name', name)
    .maybeSingle()

  if (existing?.status) {
    return { ok: false, error: 'A client with this name already exists.' }
  }

  // Blank contact fields leave what the company already had — the form is how you add a
  // contact, not how you clear one.
  const { error } = existing
    ? await supabase
        .from('clients')
        .update({
          status: true,
          contact_name: contactName ?? existing.contact_name,
          contact_email: contactEmail ?? existing.contact_email,
        })
        .eq('id', existing.id)
        .eq('org_id', workspace.id)
    : await supabase.from('clients').insert({
        org_id: workspace.id,
        name,
        contact_name: contactName,
        contact_email: contactEmail,
      })

  if (error) {
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'A client with this name already exists.'
          : 'Failed to add client. Please try again.',
    }
  }

  const reactivated = Boolean(existing)
  revalidatePath(`/${orgSlug}/members-clients`)

  const email = contactEmail
  if (!input.invite || !email) {
    return { ok: true, data: { invited: false, reactivated } }
  }

  const inviteError = await invitePortalClient(workspace.id, {
    email,
    fullName: input.contactName,
    projectId: input.projectId,
  })

  return {
    ok: true,
    data: { invited: !inviteError, inviteError, reactivated },
  }
}

async function invitePortalClient(
  orgId: string,
  input: { email: string; fullName?: string; projectId?: string }
): Promise<string | undefined> {
  const supabase = await createClient()

  const { data: emailExists, error: emailError } = await supabase.rpc(
    'check_email_exists',
    { p_email: input.email }
  )

  if (emailError) return 'Could not check that email, so no invite was sent.'
  if (emailExists) return `${input.email} already has an account.`

  const result = await inviteTeam(orgId, [
    {
      email: input.email,
      role: 'Client',
      fullName: input.fullName,
      projectId: input.projectId,
    },
  ])

  if (!result.ok) return result.error
  if (result.data.failed.length > 0) return `Could not email ${input.email}.`

  return undefined
}

export async function deactivateClientAction(
  orgSlug: string,
  clientId: string
): Promise<ActionResult> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (!isAdminRole(workspace.role)) {
    return {
      ok: false,
      error: 'Only a primary admin, admin or manager can remove clients.',
    }
  }

  // A soft flag, not a delete: `projects.client_org_id` is `on delete set null`, so
  // removing the row would strip the company's name off every project it ever paid for.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .update({ status: false })
    .eq('id', clientId)
    .eq('org_id', workspace.id)
    .select('id')

  if (error) {
    return { ok: false, error: 'Failed to deactivate. Please try again.' }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'Could not find this client — it may already be gone.',
    }
  }

  revalidatePath(`/${orgSlug}/members-clients`)
  return { ok: true }
}

export async function deactivateMembershipAction(
  orgSlug: string,
  membershipId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'You need to be signed in.' }

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (workspace.role !== 'primary_admin') {
    return {
      ok: false,
      error: 'Only the workspace primary admin can deactivate people.',
    }
  }

  const { data, error } = await supabase
    .from('memberships')
    .update({ status: false })
    .eq('id', membershipId)
    .eq('org_id', workspace.id)
    .neq('role', 'primary_admin')
    .select('id, user_id')

  if (error) {
    return { ok: false, error: 'Failed to deactivate. Please try again.' }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'Could not deactivate this person — they may already be gone.',
    }
  }

  await revokeSessions(data[0]!.user_id)

  revalidatePath(`/${orgSlug}/members-clients`)
  return { ok: true }
}

/**
 * Deactivation takes effect on the next server render either way — `getWorkspace()` now
 * filters on `status` — but a token already in the browser would stay valid until it expired.
 * This ends the session outright, so "removed access" has no tail.
 *
 * Deliberately not fatal: the flag is already false and that is the part that gates access.
 * Failing the whole action here would tell the owner the deactivation did not happen when it
 * did, and leave them retrying something that has already succeeded.
 */
async function revokeSessions(userId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.rpc('revoke_user_sessions', {
      p_user_id: userId,
    })

    if (error) {
      console.error('could not revoke sessions:', error.message)
    }
  } catch (err) {
    console.error('could not revoke sessions:', (err as Error).message)
  }
}
