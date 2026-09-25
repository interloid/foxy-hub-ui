import 'server-only'

import { getFormatter, getUserTimeZone, getWorkspace } from '@/lib/dal'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

import { formatLastActive } from './lib/format-last-active'
import type {
  ClientCompanyRow,
  MembersClientsData,
  PersonRow,
  WorkspaceRole,
} from './types'
import { STAFF_ROLES } from '@/lib/role'

import { canViewPeople } from './lib/can-view-people'

const TEAM_ROLES = STAFF_ROLES

/**
 * For queries the page cannot work without (RISK-024). Reading only `data ?? []` turned a
 * database or network failure into "Nobody here yet." — admins thought their team was
 * gone. Throwing shows the workspace error screen (with Try again) and logs the cause.
 */
function required<T extends { error: { message: string } | null }>(
  result: T,
  what: string
): T {
  if (result.error) {
    throw new Error(`Could not load ${what}: ${result.error.message}`)
  }
  return result
}

function projectCountLabel(count: number): string {
  if (count === 0) return 'No projects yet'
  return `${count} ${count === 1 ? 'project' : 'projects'}`
}

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
      clientsWithPortal: 0,
    },
    members: [],
    clients: [],
    projectOptions: [],
    viewerRole: null,
  }

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return empty
  // Second guard behind the page's check: any future caller of this query gets nothing
  // for a contributor, rather than the full roster with emails.
  if (!canViewPeople(workspace.role)) return empty

  const supabase = await createClient()
  const orgId = workspace.id

  const [
    membershipsRes,
    seatUsage,
    invitesRes,
    clientsRes,
    clientProjectsRes,
    allocationsRes,
  ] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, user_id, role, status, created_at, job_title')
      .eq('org_id', orgId)
      .in('role', TEAM_ROLES)
      .order('created_at', { ascending: true }),

    // The SAME numbers the invite check uses, so the seat card can never disagree with
    // "all seats are taken" (RISK-015): active staff + pending staff invites, against
    // the plan's max_members.
    getSeatUsage(orgId),

    supabase
      .from('invitations')
      .select('id, role, accepted_at, expires_at')
      .eq('org_id', orgId),

    supabase
      .from('clients')
      .select('id, name, contact_name, contact_email, status, portal')
      .eq('org_id', orgId)
      .order('name'),

    supabase
      .from('projects')
      .select('id, name, client_org_id, created_by')
      .eq('org_id', orgId)
      .order('name'),

    supabase
      .from('project_allocations')
      .select('project_id, user_id, effective_to, projects!inner(org_id)')
      .eq('projects.org_id', orgId),
  ])

  required(membershipsRes, 'team members')
  required(invitesRes, 'invitations')
  required(clientsRes, 'clients')
  required(clientProjectsRes, 'projects')
  required(allocationsRes, 'project allocations')

  const memberships = membershipsRes.data ?? []
  const userIds = memberships.map((m) => m.user_id)

  const [profilesRes, authProfiles] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', userIds),
    getAuthProfiles(userIds),
  ])
  required(profilesRes, 'profiles')

  const profileMap = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, p.full_name])
  )
  const today = new Date().toISOString().slice(0, 10)
  const allocatedProjects = new Map<string, Set<string>>()
  for (const row of allocationsRes.data ?? []) {
    if (row.effective_to && row.effective_to < today) continue
    let set = allocatedProjects.get(row.user_id)
    if (!set) {
      set = new Set<string>()
      allocatedProjects.set(row.user_id, set)
    }
    set.add(row.project_id)
  }

  const ownedProjects = new Map<string, number>()
  for (const row of clientProjectsRes.data ?? []) {
    if (!row.created_by) continue
    ownedProjects.set(
      row.created_by,
      (ownedProjects.get(row.created_by) ?? 0) + 1
    )
  }

  const [fmt, timeZone] = await Promise.all([getFormatter(), getUserTimeZone()])

  const members: PersonRow[] = memberships.map((membership) => {
    // The placeholder is for display only. It used to be the form's starting value too,
    // so saving any change wrote "Unnamed teammate" into the real profile (RISK-006).
    const savedName = profileMap.get(membership.user_id)?.trim() || null
    const auth = authProfiles.get(membership.user_id)

    return {
      membershipId: membership.id,
      userId: membership.user_id,
      fullName: savedName ?? 'Unnamed teammate',
      savedName,
      email: auth?.email ?? null,
      role: membership.role as WorkspaceRole,
      isActive: membership.status,
      lastActiveLabel: formatLastActive(
        auth?.lastSignInAt ?? null,
        fmt,
        timeZone
      ),
      subtitle: projectCountLabel(
        allocatedProjects.get(membership.user_id)?.size ?? 0
      ),
      allocatedProjectCount:
        allocatedProjects.get(membership.user_id)?.size ?? 0,
      ownedProjectCount: ownedProjects.get(membership.user_id) ?? 0,
      jobTitle: membership.job_title,
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

  const now = Date.now()

  // Staff invites only — client invites do not take a seat (same filter as getSeatUsage).
  const pendingInvites = (invitesRes.data ?? []).filter(
    (row) =>
      (TEAM_ROLES as readonly string[]).includes(row.role) &&
      !row.accepted_at &&
      new Date(row.expires_at).getTime() > now
  ).length

  const clients: ClientCompanyRow[] = (clientsRes.data ?? []).map((client) => ({
    id: client.id,
    name: client.name,
    contactName: client.contact_name,
    contactEmail: client.contact_email,
    projectCount: projectCounts.get(client.id) ?? 0,
    isActive: client.status,
    hasPortal: client.portal,
  }))

  return {
    metrics: {
      seatsUsed: seatUsage.used,
      seatsTotal: seatUsage.maxMembers,
      planName: seatUsage.planName,
      pendingInvites,
      activeClients: clients.filter((c) => c.isActive).length,
      clientsWithPortal: clients.filter((c) => c.isActive && c.hasPortal)
        .length,
    },
    members,
    clients,
    projectOptions,
    viewerRole: (workspace.role as WorkspaceRole) ?? null,
  }
}

export interface SeatUsage {
  planName: string
  maxMembers: number | null
  used: number
}

export interface ClientUsage {
  planName: string
  maxClients: number | null
  used: number
}

function toLimit(raw: unknown): number | null {
  return typeof raw === 'number' && raw >= 0 ? raw : null
}

async function getPlan(orgId: string) {
  const supabase = await createClient()

  const { data } = required(
    await supabase
      .from('subscriptions')
      .select('plan:plans(name, features)')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .maybeSingle(),
    'the plan'
  )

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

  required(clientsRes, 'the client count')

  return {
    planName: plan.name,
    maxClients: toLimit(plan.features?.max_clients),
    used: clientsRes.count ?? 0,
  }
}

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

  required(membersRes, 'the seat count')
  required(invitesRes, 'the pending invite count')

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
