'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { inviteTeam } from '@/features/onboarding/services/invite-team'
import type { ActionResult, InviteOutcome } from '@/features/onboarding/types'
import { getWorkspace } from '@/lib/dal'
import { isAdminRole, type InvitableStaffRole } from '@/lib/role'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  clientNameSchema,
  contactNameSchema,
  fullNameSchema,
  inviteMemberSchema,
  jobTitleSchema,
  newClientSchema,
} from './schemas'
import { canDeactivateRole } from './lib/can-deactivate-member'
import type { WorkspaceRole } from './types'

import { getClientUsage, getSeatUsage } from './queries'

const peoplePath = (orgSlug: string) => `/${orgSlug}/people`

const refreshWorkspace = (orgSlug: string) =>
  revalidatePath(`/${orgSlug}`, 'layout')

async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise
  } catch (err) {
    console.error((err as Error).message)
    return null
  }
}

const PLAN_CHECK_FAILED = 'Could not check your plan just now. Try again.'

const assignableRoleSchema = z.enum(['admin', 'manager', 'contributor'], {
  message: 'Choose admin, manager or contributor.',
})

function membershipError(
  error: { code?: string; message: string },
  fallback: string
): string {
  if (error.code === '22023') return error.message
  if (error.code === '42501') return 'You do not have permission to do that.'
  console.error('membership update failed:', error.code, error.message)
  return fallback
}

export async function inviteMemberAction(
  orgSlug: string,
  input: {
    email: string
    role: InvitableStaffRole
    fullName?: string
    jobTitle?: string
  }
): Promise<ActionResult<InviteOutcome>> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (!isAdminRole(workspace.role)) {
    return { ok: false, error: 'Only an owner or admin can invite teammates.' }
  }

  const parsed = inviteMemberSchema.safeParse({
    email: input.email,
    fullName: input.fullName ?? '',
    role: input.role,
    jobTitle: input.jobTitle,
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
    }
  }

  const supabase = await createClient()
  const email = parsed.data.email.trim().toLowerCase()
  const [seats, emailCheck, existingInvite] = await Promise.all([
    orNull(getSeatUsage(workspace.id)),
    // Server-only function (RISK-021) — the admin client, behind the admin check above.
    createAdminClient().rpc('check_email_exists', {
      p_email: parsed.data.email,
    }),
    supabase
      .from('invitations')
      .select('id')
      .eq('org_id', workspace.id)
      .eq('email', email)
      .in('role', ['admin', 'manager', 'contributor'])
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle(),
  ])

  if (!seats) return { ok: false, error: PLAN_CHECK_FAILED }

  const isResend = Boolean(existingInvite.data)
  if (
    !isResend &&
    seats.maxMembers !== null &&
    seats.used >= seats.maxMembers
  ) {
    return {
      ok: false,
      error: `Your ${seats.planName} plan covers ${seats.maxMembers} ${
        seats.maxMembers === 1 ? 'seat' : 'seats'
      } and all of them are taken. Upgrade the plan or deactivate someone first.`,
    }
  }

  if (emailCheck.error) {
    return { ok: false, error: 'Could not check that email. Try again.' }
  }

  if (emailCheck.data) {
    return {
      ok: false,
      error: 'That address already has an account — ask them to sign in.',
    }
  }

  const result = await inviteTeam(workspace.id, [
    {
      email: parsed.data.email,
      role: parsed.data.role,
      fullName: parsed.data.fullName ?? undefined,
      jobTitle: parsed.data.jobTitle ?? undefined,
    },
  ])

  if (result.ok) revalidatePath(peoplePath(orgSlug))
  return result
}

export async function createClientAction(
  orgSlug: string,
  input: {
    name: string
    contactName: string
    contactEmail: string
    portal?: boolean
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

  const parsed = newClientSchema.safeParse({
    name: input.name,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    portal: input.portal ?? true,
    invite: input.invite ?? false,
    projectId: input.projectId,
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
    }
  }

  const usage = await orNull(getClientUsage(workspace.id))
  if (!usage) return { ok: false, error: PLAN_CHECK_FAILED }
  if (usage.maxClients !== null && usage.used >= usage.maxClients) {
    return {
      ok: false,
      error: `Your ${usage.planName} plan covers ${usage.maxClients} ${
        usage.maxClients === 1 ? 'client' : 'clients'
      } and all of them are in use. Upgrade the plan or remove one first.`,
    }
  }

  const supabase = await createClient()
  const { name, contactName, contactEmail, portal } = parsed.data

  const { data: existing } = await supabase
    .from('clients')
    .select('id, status')
    .eq('org_id', workspace.id)
    .eq('name', name)
    .maybeSingle()

  if (existing?.status) {
    return { ok: false, error: 'A client with this name already exists.' }
  }

  const { error } = existing
    ? await supabase
        .from('clients')
        .update({
          status: true,
          portal,
          contact_name: contactName,
          contact_email: contactEmail,
        })
        .eq('id', existing.id)
        .eq('org_id', workspace.id)
    : await supabase.from('clients').insert({
        org_id: workspace.id,
        name,
        portal,
        contact_name: contactName,
        contact_email: contactEmail,
      })

  if (error) {
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'A client with this name already exists.'
          : error.code === 'P0001'
            ? error.message
            : 'Failed to add client. Please try again.',
    }
  }

  const reactivated = Boolean(existing)
  revalidatePath(peoplePath(orgSlug))

  const email = contactEmail
  if (!parsed.data.invite || !portal || !email) {
    return { ok: true, data: { invited: false, reactivated } }
  }

  const inviteError = await invitePortalClient(workspace.id, {
    email,
    fullName: contactName ?? undefined,
    projectId: parsed.data.projectId,
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
  // Server-only function (RISK-021). Every caller has already checked the viewer is an
  // admin of this workspace.
  const { data: emailExists, error: emailError } =
    await createAdminClient().rpc('check_email_exists', {
      p_email: input.email,
    })

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

export async function updateClientAction(
  orgSlug: string,
  clientId: string,
  input: { name: string; contactName: string; portal: boolean }
): Promise<ActionResult> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (!isAdminRole(workspace.role)) {
    return {
      ok: false,
      error: 'Only a primary admin or admin can edit clients.',
    }
  }

  const name = clientNameSchema.safeParse(input.name)
  if (!name.success) {
    return {
      ok: false,
      error: name.error.issues[0]?.message ?? 'Invalid name.',
    }
  }

  const contactName = contactNameSchema.safeParse(input.contactName)
  if (!contactName.success) {
    return {
      ok: false,
      error: contactName.error.issues[0]?.message ?? 'Invalid contact.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .update({
      name: name.data,
      contact_name: contactName.data,
      portal: input.portal,
    })
    .eq('id', clientId)
    .eq('org_id', workspace.id)
    .select('id')

  if (error) {
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'A client with this name already exists.'
          : 'Failed to save. Please try again.',
    }
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'Could not find this client.' }
  }

  revalidatePath(peoplePath(orgSlug))
  return { ok: true }
}

export async function inviteClientAction(
  orgSlug: string,
  clientId: string,
  projectId?: string
): Promise<ActionResult<{ email: string }>> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (!isAdminRole(workspace.role)) {
    return {
      ok: false,
      error: 'Only a primary admin or admin can invite clients.',
    }
  }

  const supabase = await createClient()
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, contact_name, contact_email, status, portal')
    .eq('id', clientId)
    .eq('org_id', workspace.id)
    .maybeSingle()

  if (!client) return { ok: false, error: 'Could not find this client.' }

  if (!client.contact_email) {
    return {
      ok: false,
      error: 'Add a contact email to this client before inviting them.',
    }
  }

  if (!client.portal) {
    return {
      ok: false,
      error: 'Turn on portal access for this client before inviting them.',
    }
  }

  if (!client.status) {
    return {
      ok: false,
      error: 'Reactivate this client before inviting them.',
    }
  }

  const inviteError = await invitePortalClient(workspace.id, {
    email: client.contact_email,
    fullName: client.contact_name ?? undefined,
    projectId,
  })

  if (inviteError) return { ok: false, error: inviteError }

  revalidatePath(peoplePath(orgSlug))
  return { ok: true, data: { email: client.contact_email } }
}

export async function setClientStatusAction(
  orgSlug: string,
  clientId: string,
  active: boolean
): Promise<ActionResult> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (!isAdminRole(workspace.role)) {
    return {
      ok: false,
      error: 'Only a primary admin or admin can change client status.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .update({ status: active })
    .eq('id', clientId)
    .eq('org_id', workspace.id)
    .select('id')

  if (error) {
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'Another client is already using this name.'
          : error.code === 'P0001'
            ? error.message
            : `Failed to ${active ? 'reactivate' : 'deactivate'}. Please try again.`,
    }
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'Could not find this client.' }
  }

  revalidatePath(peoplePath(orgSlug))
  return { ok: true }
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
      error: 'Only a primary admin or admin can remove clients.',
    }
  }

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

  revalidatePath(peoplePath(orgSlug))
  return { ok: true }
}

export async function updateMemberAction(
  orgSlug: string,
  membershipId: string,
  input: { fullName: string; jobTitle: string; role: WorkspaceRole }
): Promise<ActionResult> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (!isAdminRole(workspace.role)) {
    return {
      ok: false,
      error: 'Only a primary admin or admin can edit people.',
    }
  }

  const role = assignableRoleSchema.safeParse(input?.role)
  if (!role.success) {
    return {
      ok: false,
      error: role.error.issues[0]?.message ?? 'Choose a role.',
    }
  }

  const fullName = fullNameSchema.safeParse(input.fullName)
  if (!fullName.success) {
    return {
      ok: false,
      error: fullName.error.issues[0]?.message ?? 'Invalid name.',
    }
  }

  const jobTitle = jobTitleSchema.safeParse(input.jobTitle)
  if (!jobTitle.success) {
    return {
      ok: false,
      error: jobTitle.error.issues[0]?.message ?? 'Invalid job title.',
    }
  }

  const supabase = await createClient()

  const { data: target } = await supabase
    .from('memberships')
    .select('role')
    .eq('id', membershipId)
    .eq('org_id', workspace.id)
    .maybeSingle()

  if (!target) return { ok: false, error: 'That person was not found.' }
  if (target.role === 'client') {
    return { ok: false, error: 'Clients are managed on the Clients tab.' }
  }

  const { error } = await supabase.rpc('update_membership_details', {
    target_membership_id: membershipId,
    // Left out = NULL in SQL: keep the name, clear the job title (RISK-025).
    new_full_name: fullName.data ?? undefined,
    new_job_title: jobTitle.data ?? undefined,
    new_role: role.data,
  })

  if (error) {
    return {
      ok: false,
      error: membershipError(error, 'Could not save these changes. Try again.'),
    }
  }

  refreshWorkspace(orgSlug)
  return { ok: true }
}

export async function makePrimaryAdminAction(
  orgSlug: string,
  membershipId: string
): Promise<ActionResult> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (workspace.role !== 'primary_admin') {
    return {
      ok: false,
      error: 'Only the primary admin can hand over that role.',
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('transfer_primary_admin', {
    target_membership_id: membershipId,
  })

  if (error) {
    return {
      ok: false,
      error: membershipError(error, 'Could not hand over the role. Try again.'),
    }
  }

  refreshWorkspace(orgSlug)
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

  if (workspace.role !== 'primary_admin' && workspace.role !== 'admin') {
    return {
      ok: false,
      error: 'Only a primary admin or admin can deactivate people.',
    }
  }

  const { data: target } = await supabase
    .from('memberships')
    .select('role, user_id')
    .eq('id', membershipId)
    .eq('org_id', workspace.id)
    .maybeSingle()

  if (!target) {
    return { ok: false, error: 'That person was not found.' }
  }
  if (target.user_id === user.id) {
    return { ok: false, error: 'You cannot deactivate yourself.' }
  }
  if (!canDeactivateRole(workspace.role, target.role)) {
    return {
      ok: false,
      error:
        target.role === 'primary_admin'
          ? 'The primary admin cannot be deactivated.'
          : 'Only the primary admin can deactivate another admin.',
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

  revalidatePath(peoplePath(orgSlug))
  return { ok: true }
}

export async function reactivateMembershipAction(
  orgSlug: string,
  membershipId: string
): Promise<ActionResult> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (workspace.role !== 'primary_admin' && workspace.role !== 'admin') {
    return {
      ok: false,
      error: 'Only a primary admin or admin can reactivate people.',
    }
  }

  const supabase = await createClient()
  const { data: target } = await supabase
    .from('memberships')
    .select('role, status')
    .eq('id', membershipId)
    .eq('org_id', workspace.id)
    .maybeSingle()

  if (!target) return { ok: false, error: 'That person was not found.' }
  if (target.status) return { ok: false, error: 'They are already active.' }
  if (!canDeactivateRole(workspace.role, target.role)) {
    return {
      ok: false,
      error: 'Only the primary admin can reactivate another admin.',
    }
  }

  const { data, error } = await supabase
    .from('memberships')
    .update({ status: true })
    .eq('id', membershipId)
    .eq('org_id', workspace.id)
    .eq('status', false)
    .select('id')

  if (error) {
    // P0001 is the plan-limit trigger's own message ("Your plan's seats are all taken…").
    if (error.code === 'P0001') return { ok: false, error: error.message }
    return {
      ok: false,
      error: membershipError(error, 'Failed to reactivate. Please try again.'),
    }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'Could not reactivate this person — they may already be active.',
    }
  }

  revalidatePath(peoplePath(orgSlug))
  return { ok: true }
}

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

export async function resetMemberMfaAction(
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

  if (!isAdminRole(workspace.role)) {
    return {
      ok: false,
      error: 'Only an admin can reset two-factor authentication.',
    }
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('user_id, role')
    .eq('id', membershipId)
    .eq('org_id', workspace.id)
    .maybeSingle()

  if (!membership) return { ok: false, error: 'That person was not found.' }

  if (membership.user_id === user.id) {
    return {
      ok: false,
      error: 'Turn your own two-factor authentication off from Settings.',
    }
  }

  if (
    membership.role === 'primary_admin' &&
    workspace.role !== 'primary_admin'
  ) {
    return {
      ok: false,
      error: 'Only the primary admin can reset their own two-factor settings.',
    }
  }

  try {
    const admin = createAdminClient()

    const { count: adminElsewhere, error: elsewhereError } = await admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', membership.user_id)
      .neq('org_id', workspace.id)
      .in('role', ['primary_admin', 'admin'])
    if (elsewhereError) throw elsewhereError
    if (adminElsewhere) {
      return {
        ok: false,
        error:
          "They are an admin in another workspace, so their two-factor authentication can't be reset from here.",
      }
    }

    const { data: factors, error: listError } =
      await admin.auth.admin.mfa.listFactors({ userId: membership.user_id })

    if (listError) throw listError
    if (!factors?.factors.length) {
      return {
        ok: false,
        error: 'They do not have two-factor authentication turned on.',
      }
    }

    for (const factor of factors.factors) {
      const { error } = await admin.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: membership.user_id,
      })
      if (error) throw error
    }
  } catch (err) {
    console.error('reset member mfa failed:', (err as Error).message)
    return { ok: false, error: 'Could not reset two-factor authentication.' }
  }

  revalidatePath(peoplePath(orgSlug))
  return { ok: true }
}
