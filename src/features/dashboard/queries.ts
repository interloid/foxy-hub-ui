import { getWorkspace, isAdminRole } from '@/lib/dal'
import { toISODate } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

import { getLoggedMinutesForDate } from '@/lib/time-tracking'
import {
  CapacityAndLoggedData,
  ClientOption,
  MilestoneOption,
  ProjectOption,
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
  orgSlug: string
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

  const { data: orgData } = await supabase
    .from('organizations')
    .select('daily_capacity_hours')
    .eq('id', workspace.id)
    .maybeSingle()

  const dailyCapacityHours = orgData?.daily_capacity_hours ?? 8

  // Use the shared helper to calculate minutes consistently with proper organization scoping
  const alreadyLoggedMinutes = await getLoggedMinutesForDate(
    user.id,
    dateString,
    workspace.id
  )

  return { dailyCapacityHours, alreadyLoggedMinutes }
}

export async function getProjectsForOrg(
  orgSlug: string | null
): Promise<ProjectOption[]> {
  // Manual Query Parameter Validation
  if (!orgSlug || typeof orgSlug !== 'string') return []

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data, error } = await supabase
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
    .order('name', { ascending: true })

  if (error || !data) return []

  return data.map((p) => ({ id: p.id, name: p.name }))
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
  const evalDate = targetDateStr || toISODate(new Date())

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
    const role = item.role
      ? item.role.charAt(0).toUpperCase() + item.role.slice(1)
      : 'Member'

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

export const getProjects = getProjectsForOrg
export const getMilestones = getMilestonesForProject
export const getOrganizationCapacity = async (
  orgSlug: string,
  dateStr: string
) => getDailyCapacityAndLoggedMinutes(dateStr, orgSlug)
export const getTeammateCapacity = async (
  userId: string,
  orgSlug: string,
  dateStr?: string
) => getTeammateAllocatedHours(userId, orgSlug, dateStr)
export const getClients = getClientsForOrg
export const getTeamMembers = getTeamMembersForOrg
