import { getUserTimeZone, getWorkspace, isAdminRole } from '@/lib/dal'
import { todayIn } from '@/lib/date'
import { roleLabel } from '@/lib/role'
import { createClient } from '@/lib/supabase/server'

import { getLoggedMinutesForDate } from '@/lib/time-tracking'
import {
  CapacityAndLoggedData,
  ClientOption,
  MilestoneOption,
  ProjectsAndAllocationHours,
  TeammateAllocationCheck,
  TeamMemberOption,
} from './types'

export async function getClientsForOrg(
  orgSlug: string | null
): Promise<ClientOption[]> {
  if (!orgSlug || typeof orgSlug !== 'string') return []

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return []

  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('org_id', workspace.id)
    .eq('status', true)
    .order('name', { ascending: true })

  if (error || !data) return []
  return data
}

export async function getMilestonesForProject(
  projectId: string | null,
  orgSlug: string | null
): Promise<MilestoneOption[]> {
  // Manual Parameter Validation
  if (
    !projectId ||
    !orgSlug ||
    typeof projectId !== 'string' ||
    typeof orgSlug !== 'string'
  ) {
    return []
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data, error } = await supabase
    .from('milestones')
    .select(
      `
      id,
      title,
      project:projects!inner (
        org_id,
        organization:organizations!inner (
          slug,
          memberships!inner (
            user_id
          )
        )
      )
    `
    )
    .eq('project_id', projectId)
    .eq('project.organization.slug', orgSlug)
    .eq('project.organization.memberships.user_id', user.id)
    .order('title', { ascending: true })

  if (error || !data) return []

  return data.map((m) => ({ id: m.id, title: m.title }))
}

export async function getDailyCapacityAndLoggedMinutes(
  dateString: string,
  orgSlug: string,
  projectId: string
): Promise<CapacityAndLoggedData> {
  if (!dateString || !orgSlug) {
    return { dailyCapacityHours: 8, alreadyLoggedMinutes: 0 }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { dailyCapacityHours: 8, alreadyLoggedMinutes: 0 }
  }

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { dailyCapacityHours: 8, alreadyLoggedMinutes: 0 }
  }

  const { data: allocations } = await supabase
    .from('project_allocations')
    .select('hours_per_day')
    .eq('user_id', user.id)
    .eq('project_id', projectId)
    .single()

  const dailyCapacityHours = allocations ? allocations.hours_per_day : 8

  // Use the shared helper to calculate minutes consistently with proper organization scoping
  const alreadyLoggedMinutes = await getLoggedMinutesForDate(
    user.id,
    dateString,
    projectId,
    workspace.id
  )

  return { dailyCapacityHours, alreadyLoggedMinutes }
}

export async function getProjectsForOrg(
  orgSlug: string | null,
  allocatedProject: boolean
): Promise<ProjectsAndAllocationHours | null> {
  // Manual Query Parameter Validation
  if (!orgSlug || typeof orgSlug !== 'string') return null

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let projectds: string[] = []
  let totalHours = 8

  if (allocatedProject) {
    const allocatedProject = await getUserAllocatedProjects(user.id)

    // Quick optimization: If the user has no allocated projects, return early
    if (!allocatedProject) {
      return null
    }
    projectds = allocatedProject.projectIds
    totalHours = allocatedProject.totalHours
  }

  let query = supabase
    .from('projects')
    .select(
      `
    id,
    name,
    organization:organizations!inner (
      slug,
      memberships!inner (
        user_id
      )
    )
  `
    )
    .eq('organization.slug', orgSlug)
    .eq('organization.memberships.user_id', user.id)

  if (allocatedProject) {
    query = query.in('id', projectds)
  }

  const { data, error } = await query.order('name', { ascending: true })
  if (error || !data) return null

  return { projects: data.map((p) => ({ id: p.id, name: p.name })), totalHours }
}

export async function getTeammateAllocatedHours(
  targetUserId: string,
  orgSlug: string,
  targetDateStr?: string
): Promise<TeammateAllocationCheck> {
  // Manual Parameter Validation
  if (!targetUserId || !orgSlug) {
    return {
      userId: targetUserId ?? '',
      existingHoursPerDay: 0,
      maxDailyCapacity: 8,
      maxDaysPerWk: 5,
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      userId: targetUserId,
      existingHoursPerDay: 0,
      maxDailyCapacity: 8,
      maxDaysPerWk: 5,
    }
  }

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return {
      userId: targetUserId,
      existingHoursPerDay: 0,
      maxDailyCapacity: 8,
      maxDaysPerWk: 5,
    }
  }

  const { data: targetMembership } = await supabase
    .from('memberships')
    .select('id')
    .eq('org_id', workspace.id)
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (!targetMembership) {
    return {
      userId: targetUserId,
      existingHoursPerDay: 0,
      maxDailyCapacity: 8,
      maxDaysPerWk: 5,
    }
  }

  const { data: orgData } = await supabase
    .from('organizations')
    .select('daily_capacity_hours, days_per_week')
    .eq('id', workspace.id)
    .maybeSingle()

  const maxDailyCapacity = orgData?.daily_capacity_hours ?? 8
  const maxDaysPerWk = orgData?.days_per_week ?? 5
  const evalDate = targetDateStr || todayIn(await getUserTimeZone())

  const { data: allocations, error } = await supabase
    .from('project_allocations')
    .select('hours_per_day')
    .eq('user_id', targetUserId)
    .lte('effective_from', evalDate)
    .or(`effective_to.is.null,effective_to.gte.${evalDate}`)

  if (error || !allocations) {
    return {
      userId: targetUserId,
      existingHoursPerDay: 0,
      maxDailyCapacity,
      maxDaysPerWk,
    }
  }

  const existingHoursPerDay = allocations.reduce(
    (sum, item) => sum + (Number(item.hours_per_day) || 0),
    0
  )

  return {
    userId: targetUserId,
    existingHoursPerDay,
    maxDailyCapacity,
    maxDaysPerWk,
  }
}

export async function getTeamMembersForOrg(
  orgSlug: string | null
): Promise<TeamMemberOption[]> {
  if (!orgSlug || typeof orgSlug !== 'string') return []

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return []

  const canSeeCost = isAdminRole(workspace.role)
  const { data: memberships, error: membershipsError } = await supabase
    .from('memberships')
    .select('user_id, role, default_rate, cost_rate')
    .eq('org_id', workspace.id)
    .neq('role', 'client')

  if (membershipsError || !memberships || memberships.length === 0) return []

  const userIds = memberships.map((m) => m.user_id)

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)

  if (profilesError)
    console.error('Error fetching profiles:', profilesError.message)

  const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || [])

  return memberships.map((item) => {
    const fullName = profileMap.get(item.user_id) || 'Unnamed Teammate'
    const role = roleLabel(item.role) || 'Contributor'

    return {
      id: item.user_id,
      name: `${fullName} · ${role}`,
      role: item.role,
      defaultRate:
        item.default_rate !== null ? Number(item.default_rate) : null,
      costRate:
        canSeeCost && item.cost_rate !== null ? Number(item.cost_rate) : null,
    }
  })
}

async function getUserAllocatedProjects(userId: string): Promise<{
  projectIds: string[]
  totalHours: number
} | null> {
  const supabase = await createClient()

  const today = todayIn(await getUserTimeZone())

  const { data: allocations, error } = await supabase
    .from('project_allocations')
    .select('project_id, hours_per_day')
    .eq('user_id', userId)
    .lte('effective_from', today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)

  if (error) {
    console.error('Error fetching project allocations:', error)
    return null
  }

  if (!allocations) return null

  const totalHours = allocations.reduce((sum, item) => {
    const hours = Number(item.hours_per_day) || 0
    return sum + hours
  }, 0)
  const projectIds = Array.from(
    new Set(allocations.map((item) => item.project_id))
  )

  return { projectIds, totalHours }
}

export const getProjects = getProjectsForOrg
export const getMilestones = getMilestonesForProject
export const getOrganizationCapacity = async (
  orgSlug: string,
  dateStr: string,
  projectId: string
) => getDailyCapacityAndLoggedMinutes(dateStr, orgSlug, projectId)
export const getTeammateCapacity = async (
  userId: string,
  orgSlug: string,
  dateStr?: string
) => getTeammateAllocatedHours(userId, orgSlug, dateStr)
export const getClients = getClientsForOrg
export const getTeamMembers = getTeamMembersForOrg
