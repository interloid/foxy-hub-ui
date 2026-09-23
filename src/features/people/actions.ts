'use server'

import { revalidatePath } from 'next/cache'

import { inviteTeam } from '@/features/onboarding/actions'
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
import type { WorkspaceRole } from './types'

import { getClientUsage, getSeatUsage } from './queries'

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

  // The same schema the invite sheet validates against, so a bypassed form cannot store
  // a title past the 1..60 bound the column checks, or an address the sheet would have
  // rejected.
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

  // Both round trips at once. They do not depend on each other — the seat count needs
  // the org, the address check needs the email — and running them in sequence added a
  // needless round trip to every invite.
  const supabase = await createClient()
  const [seats, emailCheck] = await Promise.all([
    getSeatUsage(workspace.id),
    supabase.rpc('check_email_exists', { p_email: parsed.data.email }),
  ])

  if (seats.maxMembers !== null && seats.used >= seats.maxMembers) {
    return {
      ok: false,
      error: `Your ${seats.planName} plan covers ${seats.maxMembers} ${
        seats.maxMembers === 1 ? 'seat' : 'seats'
      } and all of them are taken. Upgrade the plan or deactivate someone first.`,
    }
  }

  // The parsed address was used above: trimmed and lowercased. Checking the raw input
  // would let " Erik@x.com " past a lookup that stores and compares the normalised form.
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
      // `?? undefined` because TeamInvite marks both optional; the schema yields null
      // for an empty field and null is not assignable to an optional property.
      jobTitle: parsed.data.jobTitle ?? undefined,
    },
  ])

  if (result.ok) revalidatePath(`/${orgSlug}/members-clients`)
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
      error: 'Only a primary admin, admin or manager can edit clients.',
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

  revalidatePath(`/${orgSlug}/members-clients`)
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
      error: 'Only a primary admin, admin or manager can invite clients.',
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

  // Both guards exist because the invite creates a LOGIN. Mailing a portal link to a
  // company whose portal is switched off, or one you have deactivated, would hand out
  // access the client list says they should not have.
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

  revalidatePath(`/${orgSlug}/members-clients`)
  return { ok: true, data: { email: client.contact_email } }
}

/**
 * Deactivate or reactivate, in one action because they are the same write with a
 * different boolean and the same authorisation. Two actions would be two places for the
 * org scoping to drift.
 */
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
      error: 'Only a primary admin, admin or manager can change client status.',
    }
  }

  // Reactivating can collide: the name is unique per org, and another live client may
  // have taken it while this one was deactivated.
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
          : `Failed to ${active ? 'reactivate' : 'deactivate'}. Please try again.`,
    }
  }

  if (!data || data.length === 0) {
    return { ok: false, error: 'Could not find this client.' }
  }

  revalidatePath(`/${orgSlug}/members-clients`)
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

/** Edit a teammate's name, role and job title. */
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
      error: 'Only a primary admin, admin or manager can edit people.',
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

  // SECURITY DEFINER, because `13_rls_profiles` lets nobody but you rename you — an admin
  // editing a teammate's name is impossible through the table policies.
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_membership_details', {
    target_membership_id: membershipId,
    // `supabase gen types` renders nullable `text` parameters as non-nullable `string`,
    // so these casts restore what the function actually accepts. Null is meaningful on
    // both: a null name makes the function SKIP the profiles write (you cleared the box,
    // you did not rename them to ''), and a null title clears job_title. Coercing to ''
    // would write an empty name and an empty title instead.
    new_full_name: fullName.data as unknown as string,
    new_job_title: jobTitle.data as unknown as string,
    new_role: input.role,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/${orgSlug}/members-clients`)
  return { ok: true }
}

/**
 * Hand the primary_admin role to an admin.
 *
 * The swap itself is a database function: the row policy forbids both halves by design,
 * and doing it in two client-side writes would leave a window with two primary admins —
 * which the partial unique index would reject anyway, mid-transfer.
 */
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

  if (error) return { ok: false, error: error.message }

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
