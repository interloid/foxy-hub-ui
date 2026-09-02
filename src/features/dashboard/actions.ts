'use server'

import { getWorkspace, isAdminRole } from '@/lib/dal'
import { toISODate } from '@/lib/date'
import { parseDurationToMinutes } from '@/lib/duration'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/supabase'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ActionResult } from '../onboarding/types'
import { createProjectSchema } from './schema'

// Helper for formatting Zod validation errors
function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input parameters'
}
const createTimeEntrySchema = z.object({
  orgSlug: z.string().min(1, 'Organization slug is required'),
  projectId: z.uuid('Invalid project ID'),
  milestoneId: z.uuid('Invalid milestone ID').optional().nullable(),
  workDate: z.string().min(1, 'Work date is required'),
  durationStr: z.string().min(1, 'Duration string is required'),
  description: z.string().max(500, 'Description too long'),
})

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

export interface CapacityAndLoggedData {
  dailyCapacityHours: number
  alreadyLoggedMinutes: number
}

export interface ProjectOption {
  id: string
  name: string
}

export interface MilestoneOption {
  id: string
  title: string
}

type ProjectInsert = Database['public']['Tables']['projects']['Insert']
type AllocationInsert =
  Database['public']['Tables']['project_allocations']['Insert']

export async function getUserName(): Promise<ActionResult<{ name: string }>> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'Invalid token or not signed in.' }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  if (error) {
    return { ok: false, error: error.message }
  }

  const name = data?.full_name
    ? data.full_name
    : user.email
      ? user.email.split('@')[0]!
      : 'User'

  return { ok: true, data: { name } }
}

export async function getDailyCapacityAndLoggedMinutes(
  dateString: string,
  orgSlug: string
): Promise<CapacityAndLoggedData> {
  // Manual Query Parameter Validation (No Zod)
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

  const { data: entries } = await supabase
    .from('time_entries')
    .select('duration_minutes')
    .eq('user_id', user.id)
    .eq('work_date', dateString)

  const alreadyLoggedMinutes =
    entries?.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0) ?? 0

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

export async function createTimeEntry(
  rawInput: unknown
): Promise<ActionResult> {
  // 1. Zod Body Validation
  const parsed = createTimeEntrySchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) }
  }

  const params = parsed.data
  const supabase = await createClient()

  // 2. Authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'User is not authenticated.' }
  }

  const durationMinutes = parseDurationToMinutes(params.durationStr)
  if (!durationMinutes || durationMinutes <= 0) {
    return { ok: false, error: 'Invalid duration specified.' }
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id, organizations!inner(slug)')
    .eq('id', params.projectId)
    .eq('organizations.slug', params.orgSlug)
    .maybeSingle()

  if (!project) {
    return { ok: false, error: 'Invalid project or organization.' }
  }

  if (params.milestoneId) {
    const { data: milestone } = await supabase
      .from('milestones')
      .select('id')
      .eq('id', params.milestoneId)
      .eq('project_id', params.projectId)
      .maybeSingle()

    if (!milestone) {
      return { ok: false, error: 'Invalid milestone for this project.' }
    }
  }

  const { data: orgData } = await supabase
    .from('organizations')
    .select('id, daily_capacity_hours')
    .eq('slug', params.orgSlug)
    .maybeSingle()

  if (!orgData) {
    return { ok: false, error: 'Organization not found.' }
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
      ok: false,
      error: `Exceeds daily capacity. You only have ${remainingHours} hours remaining for ${params.workDate}.`,
    }
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
    console.error('Create Time Entry Error:', error.message)
    return { ok: false, error: 'Failed to record time entry.' }
  }

  // 3. Revalidate Path
  revalidatePath(`/${params.orgSlug}`)
  return { ok: true }
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

export async function createProject(
  rawParams: unknown,
  orgSlug: string
): Promise<ActionResult> {
  // 1. Manual Validation for route/query args
  if (!orgSlug || typeof orgSlug !== 'string') {
    return { ok: false, error: 'Organization slug is required.' }
  }

  // 2. Schema Validation for complex payload
  const parsed = createProjectSchema.safeParse(rawParams)
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) }
  }

  const params = parsed.data

  // 3. Workspace & Admin Authorization
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }

  const isAdmin = await isAdminRole(workspace.role)
  if (!isAdmin) {
    return {
      ok: false,
      error: 'Unauthorized: Only administrators can create projects.',
    }
  }

  const supabase = await createClient()

  // 4. Over-allocation check
  const { data: orgData } = await supabase
    .from('organizations')
    .select('daily_capacity_hours')
    .eq('id', workspace.id)
    .single()

  const maxDailyCapacity = orgData?.daily_capacity_hours ?? 8

  if (params.allocations && params.allocations.length > 0) {
    for (const alloc of params.allocations) {
      const { existingHoursPerDay } = await getTeammateAllocatedHours(
        alloc.userId,
        orgSlug,
        alloc.effectiveFrom
      )

      const totalHours = existingHoursPerDay + alloc.hoursPerDay
      if (totalHours > maxDailyCapacity && !params.overrideReason?.trim()) {
        return {
          ok: false,
          error: `An override reason is required because allocation exceeds capacity for user (${totalHours} hrs/day > ${maxDailyCapacity} max hrs/day).`,
        }
      }
    }
  }

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
  const periodMap: Record<string, 'monthly' | 'weekly'> = {
    Monthly: 'monthly',
    Weekly: 'weekly',
  }

  const dbRetainerPeriod = params.retainerBillingPeriod
    ? periodMap[params.retainerBillingPeriod]
    : null

  const projectPayload: ProjectInsert = {
    org_id: workspace.id,
    name: params.name.trim(),
    due_date: params.dueDate || null,
    engagement: dbEngagement,
    client_id: params.clientId,
    contract_value: params.budget ?? null,
    retainer_hours: params.retainerBucketHours ?? null,
    retainer_period: dbRetainerPeriod,
    retainer_amount: params.retainerAmount ?? null,
    retainer_overage: params.retainerOverageRate ?? null,
    description: params.brief?.trim() || null,
    override_reason: params.overrideReason?.trim() || null,
    start_from: params.startFrom || 'blank',
    status: 'pending',
  }

  const allocationRows: AllocationInsert[] = (params.allocations || []).map(
    (alloc) => ({
      project_id: '', // Resolved inside RPC transaction
      user_id: alloc.userId,
      hours_per_day: alloc.hoursPerDay,
      days_per_week: alloc.daysPerWk,
      rate: alloc.rate ?? null,
      effective_from: alloc.effectiveFrom,
    })
  )

  // 5. Execute Atomic RPC Transaction
  const { data: createdProjectId, error: rpcError } = await supabase.rpc(
    'create_project_with_allocations',
    {
      project_data: projectPayload,
      allocations_data: allocationRows,
    }
  )

  if (rpcError || !createdProjectId) {
    console.error(
      'create_project_with_allocations RPC error:',
      rpcError?.message
    )
    return { ok: false, error: 'Failed to create project and allocations.' }
  }

  // 6. Path Revalidation
  revalidatePath(`/${orgSlug}`)
  return { ok: true }
}

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

  const { data: memberships, error: membershipsError } = await supabase
    .from('memberships')
    .select('user_id, role')
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
