import 'server-only'

import { getWorkspace } from '@/lib/dal'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

import { formatLastActive } from './lib/format-last-active'
import type { MembersClientsData, PersonRow, WorkspaceRole } from './types'
import { STAFF_ROLES } from '@/lib/role'

// Staff, as an explicit allow-list: a role missing from here is invisible on
// the Members screen AND uncounted against the plan's seats.
const TEAM_ROLES = STAFF_ROLES

export async function getMembersClientsData(
  orgSlug: string
): Promise<MembersClientsData> {
  const empty: MembersClientsData = {
    metrics: {
      seatsUsed: 0,
      seatsTotal: null,
      planName: 'Free',
      pendingInvites: 0,
      activeClients: 0,
    },
    members: [],
    clients: [],
    projectOptions: [],
    viewerRole: null,
  }

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return empty

  const supabase = await createClient()
  const orgId = workspace.id

  const [
    membershipsRes,
    subscriptionRes,
    invitesRes,
    clientsRes,
    clientProjectsRes,
  ] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, user_id, role, status, created_at')
      .eq('org_id', orgId)
      .in('role', TEAM_ROLES)
      .order('created_at', { ascending: true }),

    supabase
      .from('subscriptions')
      .select('plan:plans(name, seats)')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .maybeSingle(),

    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString()),

    supabase
      .from('clients')
      .select('id, name, contact_name, contact_email, status')
      .eq('org_id', orgId)
      .order('name'),

    supabase
      .from('projects')
      .select('id, name, client_org_id')
      .eq('org_id', orgId)
      .order('name'),
  ])

  const memberships = membershipsRes.data ?? []
  const userIds = memberships.map((m) => m.user_id)

  const [profilesRes, authProfiles] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', userIds),
    getAuthProfiles(userIds),
  ])

  const profileMap = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, p.full_name])
  )

  const members: PersonRow[] = memberships.map((membership) => {
    const fullName = profileMap.get(membership.user_id) || 'Unnamed teammate'
    const auth = authProfiles.get(membership.user_id)

    return {
      membershipId: membership.id,
      userId: membership.user_id,
      fullName,
      email: auth?.email ?? null,
      role: membership.role as WorkspaceRole,
      isActive: membership.status,
      lastActiveLabel: formatLastActive(auth?.lastSignInAt ?? null),
      subtitle: 'Team member',
    }
  })

  const projectCounts = new Map<string, number>()
  for (const row of clientProjectsRes.data ?? []) {
    if (!row.client_org_id) continue
    projectCounts.set(
      row.client_org_id,
      (projectCounts.get(row.client_org_id) ?? 0) + 1
    )
  }

  const projectOptions = (clientProjectsRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
  }))

  const clients = (clientsRes.data ?? []).map((client) => ({
    id: client.id,
    name: client.name,
    contactName: client.contact_name,
    contactEmail: client.contact_email,
    projectCount: projectCounts.get(client.id) ?? 0,
    isActive: client.status,
  }))

  const plan = subscriptionRes.data?.plan
  const planRow = Array.isArray(plan) ? plan[0] : plan

  return {
    metrics: {
      seatsUsed: members.length,
      seatsTotal: planRow?.seats ?? null,
      planName: planRow?.name || 'Free',
      pendingInvites: invitesRes.count ?? 0,
      activeClients: clients.filter((c) => c.isActive).length,
    },
    members,
    clients,
    projectOptions,
    viewerRole: (workspace.role as WorkspaceRole) ?? null,
  }
}

export interface SeatUsage {
  planName: string
  /** null means unlimited — the seed uses -1 for that, and a missing key is untracked. */
  maxMembers: number | null
  used: number
}

export interface ClientUsage {
  planName: string
  maxClients: number | null
  used: number
}

/** A negative entitlement means unlimited, and so does one the plan doesn't state. */
function toLimit(raw: unknown): number | null {
  return typeof raw === 'number' && raw >= 0 ? raw : null
}

async function getPlan(orgId: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('subscriptions')
    .select('plan:plans(name, features)')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .maybeSingle()

  const plan = data?.plan
  const planRow = Array.isArray(plan) ? plan[0] : plan

  return {
    name: planRow?.name || 'Free',
    features: (planRow?.features ?? null) as {
      max_members?: unknown
      max_clients?: unknown
    } | null,
  }
}

export async function getClientUsage(orgId: string): Promise<ClientUsage> {
  const supabase = await createClient()

  const [plan, clientsRes] = await Promise.all([
    getPlan(orgId),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', true),
  ])

  return {
    planName: plan.name,
    maxClients: toLimit(plan.features?.max_clients),
    used: clientsRes.count ?? 0,
  }
}

/**
 * Seats already spoken for: accepted team members plus invitations still
 * outstanding, so two invites sent back to back can't both slip under the cap.
 */
export async function getSeatUsage(orgId: string): Promise<SeatUsage> {
  const supabase = await createClient()

  const [plan, membersRes, invitesRes] = await Promise.all([
    getPlan(orgId),

    supabase
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('role', TEAM_ROLES)
      .eq('status', true),

    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('role', TEAM_ROLES)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString()),
  ])

  return {
    planName: plan.name,
    maxMembers: toLimit(plan.features?.max_members),
    used: (membersRes.count ?? 0) + (invitesRes.count ?? 0),
  }
}

async function getAuthProfiles(
  userIds: string[]
): Promise<Map<string, { email: string | null; lastSignInAt: string | null }>> {
  const map = new Map<
    string,
    { email: string | null; lastSignInAt: string | null }
  >()

  if (userIds.length === 0) return map

  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error((err as Error).message)
    return map
  }

  const results = await Promise.all(
    userIds.map((id) => admin.auth.admin.getUserById(id))
  )

  results.forEach((result, index) => {
    const user = result.data?.user
    map.set(userIds[index]!, {
      email: user?.email ?? null,
      lastSignInAt: user?.last_sign_in_at ?? null,
    })
  })

  return map
}
