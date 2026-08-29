'use server'

import { getWorkspace } from '@/lib/dal'
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

// ==========================================
// ZOD SCHEMAS
// ==========================================

const createTimeEntrySchema = z.object({
  orgSlug: z.string().min(1, 'Organization slug is required'),
  projectId: z.uuid('Invalid project ID'),
  milestoneId: z.uuid('Invalid milestone ID').optional().nullable(),
  workDate: z.string().min(1, 'Work date is required'),
  durationStr: z.string().min(1, 'Duration string is required'),
  description: z.string().max(500, 'Description too long'),
})

// ==========================================
// EXPORTED TYPES
// ==========================================

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

// ==========================================
// SERVER ACTIONS
// ==========================================

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

export async function getProjectsForOrg(
  orgSlug: string
): Promise<ProjectOption[]> {
  if (!orgSlug) return []

  const supabase = await createClient()

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  // 2. Query projects strictly filtered by org_slug AND active user membership
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
  projectId: string,
  orgSlug: string
): Promise<MilestoneOption[]> {
  if (!projectId || !orgSlug) return []

  const supabase = await createClient()

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  // 2. Query milestones ensuring project belongs to org AND user is a member
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
  console.log(rawInput)
  const parsed = createTimeEntrySchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) }
  }

  const params = parsed.data
  const supabase = await createClient()

  // 1. Authenticate User
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'User is not authenticated.' }
  }

  // 2. Validate Duration
  const durationMinutes = parseDurationToMinutes(params.durationStr)
  if (!durationMinutes || durationMinutes <= 0) {
    return { ok: false, error: 'Invalid duration specified.' }
  }

  // 3. Verify Project and Org Ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id, organizations!inner(slug)')
    .eq('id', params.projectId)
    .eq('organizations.slug', params.orgSlug)
    .maybeSingle()

  if (!project) {
    return { ok: false, error: 'Invalid project or organization.' }
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
      return { ok: false, error: 'Invalid milestone for this project.' }
    }
  }

  // 5. Enforce Daily Capacity Server-Side
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
    return { ok: false, error: error.message }
  }

  revalidatePath(`/${params.orgSlug}`)
  return { ok: true }
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
  rawParams: unknown,
  orgSlug: string
): Promise<ActionResult> {
  const parsed = createProjectSchema.safeParse(rawParams)
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) }
  }

  const params = parsed.data
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }

  const supabase = await createClient()

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
    // Quarterly: 'quarterly',
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

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert(projectPayload)
    .select('id')
    .single()

  if (projectError || !project) {
    console.error('createProject failed:', projectError?.message)
    return { ok: false, error: 'Failed to create project.' }
  }

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
      return { ok: false, error: 'Project created, but allocations failed.' }
    }
  }

  revalidatePath(`/${orgSlug}`)
  return { ok: true }
}

export async function getClientsForOrg(): Promise<ClientOption[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership?.org_id) return []

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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data: userMembership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!userMembership?.org_id) return []

  const { data: memberships, error: membershipsError } = await supabase
    .from('memberships')
    .select('user_id, role')
    .eq('org_id', userMembership.org_id)
    .neq('role', 'client')

  if (membershipsError || !memberships || memberships.length === 0) return []

  const userIds = memberships.map((m) => m.user_id)

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)

  if (profilesError) console.error('Error fetching profiles:', profilesError)

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
