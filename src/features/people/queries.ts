import 'server-only'

import { getWorkspace } from '@/lib/dal'
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

const TEAM_ROLES = STAFF_ROLES

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

  const supabase = await createClient()
  const orgId = workspace.id

  const [
    membershipsRes,
    subscriptionRes,
    invitesRes,
    clientsRes,
    clientProjectsRes,
    allocationsRes,
    clientMembershipsRes,
  ] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, user_id, role, status, created_at, job_title')
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
      // Rows, not just a count: the count still drives the Pending invites metric, but
      // the Clients tab also needs to know which contact has an outstanding or redeemed
      // invitation, so the edit sheet can offer invite / resend / nothing.
      .from('invitations')
      .select('id, email, accepted_at, expires_at')
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

    // Client memberships. `TEAM_ROLES` deliberately excludes them, so without this the
    // Clients tab has no way to know a contact already signed in — which is exactly how
    // a client with portal access ended up being offered a "Send invite" button that
    // `check_email_exists` then refuses.
    supabase
      .from('memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('role', 'client'),
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

  // user_id -> projects they opened. Same source as the client project counts, so this
  // costs no extra query.
  const ownedProjects = new Map<string, number>()
  for (const row of clientProjectsRes.data ?? []) {
    if (!row.created_by) continue
    ownedProjects.set(
      row.created_by,
      (ownedProjects.get(row.created_by) ?? 0) + 1
    )
  }

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

  // lower(email) -> status. The unique index on (org_id, lower(email)) covers only
  // UNACCEPTED rows, so one address can hold a live invite plus historic accepted ones —
  // an accepted row therefore wins over a pending one.
  const now = Date.now()
  const inviteByEmail = new Map<string, 'pending' | 'accepted'>()
  for (const row of invitesRes.data ?? []) {
    const key = row.email.trim().toLowerCase()
    if (row.accepted_at) {
      inviteByEmail.set(key, 'accepted')
      continue
    }
    const live = new Date(row.expires_at).getTime() > now
    if (live && inviteByEmail.get(key) !== 'accepted') {
      inviteByEmail.set(key, 'pending')
    }
  }

  const pendingInvites = (invitesRes.data ?? []).filter(
    (row) => !row.accepted_at && new Date(row.expires_at).getTime() > now
  ).length

  // Anyone holding a client membership is in, whatever route they took. Seeded clients
  // and clients invited from another workspace have no `invitations` row in this org, so
  // the invite table alone reports them as never invited.
  const clientUserIds = (clientMembershipsRes.data ?? []).map((m) => m.user_id)
  const clientAuth = await getAuthProfiles(clientUserIds)
  const onboardedEmails = new Set(
    [...clientAuth.values()]
      .map((a) => a.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email))
  )

  const clients: ClientCompanyRow[] = (clientsRes.data ?? []).map((client) => ({
    id: client.id,
    name: client.name,
    contactName: client.contact_name,
    contactEmail: client.contact_email,
    projectCount: projectCounts.get(client.id) ?? 0,
    isActive: client.status,
    hasPortal: client.portal,
    inviteStatus: resolveInviteStatus(
      client.contact_email,
      onboardedEmails,
      inviteByEmail
    ),
  }))

  const plan = subscriptionRes.data?.plan
  const planRow = Array.isArray(plan) ? plan[0] : plan

  return {
    metrics: {
      seatsUsed: members.length,
      seatsTotal: planRow?.seats ?? null,
      planName: planRow?.name || 'Free',
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

/**
 * A membership beats an invitation row. Someone can hold client access with no invite on
 * file (seeded, or created directly), and an expired invite does not undo access they
 * already have — so the account check comes first.
 */
function resolveInviteStatus(
  contactEmail: string | null,
  onboarded: Set<string>,
  invites: Map<string, 'pending' | 'accepted'>
): ClientCompanyRow['inviteStatus'] {
  if (!contactEmail) return 'none'
  const key = contactEmail.trim().toLowerCase()
  if (onboarded.has(key)) return 'accepted'
  return invites.get(key) ?? 'none'
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
