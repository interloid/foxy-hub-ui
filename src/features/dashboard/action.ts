'use server'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/supabase'

export async function getUserName() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'Invalid token.' }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  if (error) {
    return { ok: false, error: error.message }
  }

  const name = data.full_name
    ? data.full_name
    : user.email
      ? user.email.split('@')[0]
      : undefined

  return { ok: true, name }
}

export interface ClientOption {
  id: string
  name: string
}

export interface TeamMemberOption {
  id: string
  name: string
  role: string
}

export interface TeammateAllocationCheck {
  userId: string
  existingHoursPerDay: number
  maxDailyCapacity: number
  maxDaysPerWk: number
}
interface CapacityAndLoggedData {
  dailyCapacityHours: number
  alreadyLoggedMinutes: number
}

export interface ProjectAllocationInput {
  userId: string
  hoursPerDay: number
  daysPerWk: number
  rate?: number
  effectiveFrom: string
}

export interface CreateProjectParams {
  name: string
  startFrom?: string
  clientId?: string | null
  dueDate?: string | null
  engagement: 'full_time' | 'part_time' | 'retainer' | 'fixed'
  budget?: number | null
  brief?: string
  overrideReason?: string
  allocations: ProjectAllocationInput[]
}

type ProjectInsert = Database['public']['Tables']['projects']['Insert']
type AllocationInsert =
  Database['public']['Tables']['project_allocations']['Insert']

export async function getDailyCapacityAndLoggedMinutes(
  dateString: string
): Promise<CapacityAndLoggedData> {
  const supabase = await createClient()

  // 1. Get Authenticated User
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { dailyCapacityHours: 8, alreadyLoggedMinutes: 0 }
  }

  // 2. Fetch Org Daily Capacity
  const { data: orgData } = await supabase
    .from('organizations')
    .select('daily_capacity_hours')
    .limit(1)
    .single()

  const dailyCapacityHours = orgData?.daily_capacity_hours ?? 8

  // 3. Fetch Sum of Logged Minutes for Selected Date
  const { data: entries } = await supabase
    .from('time_entries')
    .select('duration_minutes')
    .eq('user_id', user.id)
    .eq('work_date', dateString)

  const alreadyLoggedMinutes =
    entries?.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0) ?? 0

  return { dailyCapacityHours, alreadyLoggedMinutes }
}

export interface ProjectOption {
  id: string
  name: string
}

export interface MilestoneOption {
  id: string
  title: string
}

export async function getProjectsForOrg(): Promise<ProjectOption[]> {
  const supabase = await createClient()

  // Fetch projects belonging to the user's organization
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .order('name', { ascending: true })

  if (error || !data) return []
  return data
}

export async function getMilestonesForProject(
  projectId: string
): Promise<MilestoneOption[]> {
  if (!projectId) return []

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('milestones')
    .select('id, title')
    .eq('project_id', projectId)
    .order('title', { ascending: true })

  if (error || !data) return []
  return data
}

export interface CreateTimeEntryParams {
  projectId: string
  milestoneId?: string | null
  workDate: string
  durationStr: string
  description: string
}

export async function createTimeEntry(params: CreateTimeEntryParams) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'User is not authenticated.' }
  }

  const durationMinutes = parseDurationToMinutes(params.durationStr)
  if (!durationMinutes || durationMinutes <= 0) {
    return { success: false, error: 'Invalid duration specified.' }
  }

  const { error } = await supabase.from('time_entries').insert({
    user_id: user.id,
    project_id: params.projectId,
    milestone_id: params.milestoneId || null,
    work_date: params.workDate,
    duration_minutes: durationMinutes,
    description: params.description.trim(),
    status: 'draft',
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

function parseDurationToMinutes(val: string): number | null {
  const trimmed = val.trim().toLowerCase()
  if (!trimmed || trimmed.includes('-')) return null

  const timeRegex = /^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+)m)?$/
  const timeMatch = trimmed.match(timeRegex)

  if (timeMatch && (timeMatch[1] !== undefined || timeMatch[2] !== undefined)) {
    const hours = timeMatch[1] ? parseFloat(timeMatch[1]) : 0
    const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
    const total = Math.round(hours * 60 + mins)
    return isNaN(total) || total <= 0 ? null : total
  }

  const num = parseFloat(trimmed)
  if (!isNaN(num) && num > 0) {
    return Math.round(num * 60)
  }

  return null
}

export async function getTeammateAllocatedHours(
  userId: string,
  targetDateStr?: string
): Promise<TeammateAllocationCheck> {
  const supabase = await createClient()

  const { data: orgData } = await supabase
    .from('organizations')
    .select('daily_capacity_hours, days_per_week')
    .limit(1)
    .single()

  const maxDailyCapacity = orgData?.daily_capacity_hours ?? 8
  const maxDaysPerWk = orgData?.days_per_week ?? 5
  const evalDate = targetDateStr || new Date().toISOString().split('T')[0]

  const { data: allocations, error } = await supabase
    .from('project_allocations')
    .select('hours_per_day')
    .eq('user_id', userId)
    .lte('effective_from', evalDate)
    .or(`effective_to.is.null,effective_to.gte.${evalDate}`)

  if (error || !allocations) {
    return { userId, existingHoursPerDay: 0, maxDailyCapacity, maxDaysPerWk }
  }

  const existingHoursPerDay = allocations.reduce(
    (sum, item) => sum + (Number(item.hours_per_day) || 0),
    0
  )

  return { userId, existingHoursPerDay, maxDailyCapacity, maxDaysPerWk }
}

export async function createProject(params: CreateProjectParams) {
  const supabase = await createClient()

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'User is not authenticated.' }
  }

  // 2. Fetch user's organization ID from memberships
  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (membershipError || !membership?.org_id) {
    return { success: false, error: 'Failed to retrieve user organization.' }
  }

  // 3. Map engagement model string to strict database enum value
  const engagementEnumMap = {
    'full-time': 'full_time',
    'part-time': 'part_time',
    retainer: 'retainer',
    'fixed-price': 'fixed',
    fixed: 'fixed',
    full_time: 'full_time',
    part_time: 'part_time',
  } as const

  const dbEngagement =
    engagementEnumMap[params.engagement as keyof typeof engagementEnumMap] ??
    'full_time'

  // 4. Construct project insert payload (without start_from)
  const projectPayload: ProjectInsert = {
    org_id: membership.org_id,
    name: params.name.trim(),
    client_org_id: params.clientId || null,
    due_date: params.dueDate || null,
    engagement: dbEngagement,
    contract_value: params.budget ?? null,
    description: params.brief?.trim() || null,
    override_reason: params.overrideReason?.trim() || null,
    status: 'pending',
  }

  // 5. Insert project record
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert(projectPayload)
    .select('id')
    .single()

  if (projectError || !project) {
    return {
      success: false,
      error: projectError?.message || 'Failed to create project.',
    }
  }

  // 6. Insert team allocations
  if (params.allocations && params.allocations.length > 0) {
    const allocationRows: AllocationInsert[] = params.allocations.map(
      (alloc) => ({
        project_id: project.id,
        user_id: alloc.userId,
        hours_per_day: alloc.hoursPerDay,
        days_per_week: alloc.daysPerWk,
        rate: alloc.rate ?? null,
        effective_from: alloc.effectiveFrom,
      })
    )

    const { error: allocError } = await supabase
      .from('project_allocations')
      .insert(allocationRows)

    if (allocError) {
      return {
        success: false,
        error: `Project created, but allocations failed: ${allocError.message}`,
      }
    }
  }

  return { success: true, projectId: project.id }
}

export async function getClientsForOrg(): Promise<ClientOption[]> {
  const supabase = await createClient()

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  // 2. Fetch user's org_id
  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership?.org_id) return []

  // 3. Fetch clients sorted by name
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('org_id', membership.org_id)
    .order('name', { ascending: true })

  if (error || !data) return []

  return data
}

export async function getTeamMembersForOrg(): Promise<TeamMemberOption[]> {
  const supabase = await createClient()

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  // 2. Fetch authenticated user's organization ID
  const { data: userMembership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!userMembership?.org_id) return []

  // 3. Query memberships joined with profiles for that org
  const { data, error } = await supabase
    .from('memberships')
    .select(
      `
      user_id,
      role,
      profiles!inner (
        full_name
      )
    `
    )
    .eq('org_id', userMembership.org_id)

  if (error || !data) return []

  return data.map((item) => {
    const rawProfile = Array.isArray(item.profiles)
      ? item.profiles[0]
      : item.profiles
    const name = rawProfile?.full_name || 'Unnamed Teammate'
    const role = item.role
      ? item.role.charAt(0).toUpperCase() + item.role.slice(1)
      : 'Member'

    return {
      id: item.user_id,
      name: `${name} · ${role}`,
      role: item.role,
    }
  })
}
