'use server'
import { getWorkspace } from '@/lib/dal'
import { toISODate } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/supabase'
import { revalidatePath } from 'next/cache'

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
  dateString: string,
  orgSlug: string
): Promise<CapacityAndLoggedData> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { dailyCapacityHours: 8, alreadyLoggedMinutes: 0 }
  }

  const { data: orgData } = await supabase
    .from('organizations')
    .select('daily_capacity_hours')
    .eq('slug', orgSlug)
    .maybeSingle()

  const dailyCapacityHours = orgData?.daily_capacity_hours ?? 8

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
  orgSlug: string // Added orgSlug to verify multi-tenant isolation & capacity
  projectId: string
  milestoneId?: string | null
  workDate: string
  durationStr: string
  description: string
}

export async function createTimeEntry(params: CreateTimeEntryParams) {
  const supabase = await createClient()

  // 1. Authenticate User
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'User is not authenticated.' }
  }

  // 2. Validate Duration
  const durationMinutes = parseDurationToMinutes(params.durationStr)
  if (!durationMinutes || durationMinutes <= 0) {
    return { success: false, error: 'Invalid duration specified.' }
  }

  // 3. Verify Project and Org Ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id, organizations!inner(slug)')
    .eq('id', params.projectId)
    .eq('organizations.slug', params.orgSlug)
    .maybeSingle()

  if (!project) {
    return { success: false, error: 'Invalid project or organization.' }
  }

  // 4. Verify Milestone belongs to this Project (if provided)
  if (params.milestoneId) {
    const { data: milestone } = await supabase
      .from('milestones')
      .select('id')
      .eq('id', params.milestoneId)
      .eq('project_id', params.projectId)
      .maybeSingle()

    if (!milestone) {
      return { success: false, error: 'Invalid milestone for this project.' }
    }
  }

  // 5. Enforce Daily Capacity Server-Side
  const { data: orgData } = await supabase
    .from('organizations')
    .select('id, daily_capacity_hours')
    .eq('slug', params.orgSlug)
    .maybeSingle()

  if (!orgData) {
    return { success: false, error: 'Organization not found.' }
  }

  const dailyCapacityMinutes = (orgData.daily_capacity_hours ?? 8) * 60

  const { data: existingEntries } = await supabase
    .from('time_entries')
    .select('duration_minutes, projects!inner(org_id)')
    .eq('user_id', user.id)
    .eq('work_date', params.workDate)
    .eq('projects.org_id', orgData.id)

  const alreadyLoggedMinutes = (existingEntries ?? []).reduce(
    (sum, entry) => sum + (entry.duration_minutes ?? 0),
    0
  )

  if (alreadyLoggedMinutes + durationMinutes > dailyCapacityMinutes) {
    const remainingMinutes = Math.max(
      0,
      dailyCapacityMinutes - alreadyLoggedMinutes
    )
    const remainingHours = (remainingMinutes / 60).toFixed(1)
    return {
      success: false,
      error: `Exceeds daily capacity. You only have ${remainingHours} hours remaining for ${params.workDate}.`,
    }
  }

  // 6. Insert Time Entry
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

  // Revalidate workspace dashboard cache so the UI updates immediately
  revalidatePath(`/${params.orgSlug}`)

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
  orgSlug: string,
  targetDateStr?: string
): Promise<TeammateAllocationCheck> {
  const supabase = await createClient()

  const { data: orgData } = await supabase
    .from('organizations')
    .select('daily_capacity_hours, days_per_week')
    .eq('slug', orgSlug)
    .maybeSingle()

  const maxDailyCapacity = orgData?.daily_capacity_hours ?? 8
  const maxDaysPerWk = orgData?.days_per_week ?? 5
  const evalDate = targetDateStr || toISODate(new Date())

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

export async function createProject(
  params: CreateProjectParams,
  orgSlug: string
) {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }
  const supabase = await createClient()

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

  // 4. Construct project insert payload including start_from (M20 fixed)
  const projectPayload: ProjectInsert = {
    org_id: workspace.id,
    name: params.name.trim(),
    // client_id: params.clientId || null,
    due_date: params.dueDate || null,
    engagement: dbEngagement,
    contract_value: params.budget ?? null,
    description: params.brief?.trim() || null,
    override_reason: params.overrideReason?.trim() || null,
    start_from: params.startFrom || 'blank',
    status: 'pending',
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert(projectPayload)
    .select('id')
    .single()

  if (projectError || !project) {
    console.error('createProject failed:', projectError?.message)
    return {
      ok: false,
      error: 'Failed to create project.',
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
      console.error('project allocations insertion failed:', allocError.message)
      return {
        ok: false,
        error: 'Project created, but allocations failed.',
      }
    }
  }

  // Revalidate workspace dashboard cache so the UI updates immediately
  revalidatePath(`/${orgSlug}`)

  return { ok: true }
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

export async function getTeamMembersForOrg() {
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

  // 3. Query memberships for that org
  const { data: memberships, error: membershipsError } = await supabase
    .from('memberships')
    .select('user_id, role')
    .eq('org_id', userMembership.org_id)
    .neq('role', 'client')

  if (membershipsError || !memberships || memberships.length === 0) return []

  // 4. Extract user IDs and fetch profiles
  const userIds = memberships.map((m) => m.user_id)

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)

  if (profilesError) console.error('Error fetching profiles:', profilesError)

  // 5. Map profiles back to memberships
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
    }
  })
}
