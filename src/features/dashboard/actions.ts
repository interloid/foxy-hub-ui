'use server'

import { getWorkspace, isAdminRole } from '@/lib/dal'
import { parseDurationToMinutes } from '@/lib/duration'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/supabase'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ActionResult } from '../onboarding/types'
import { getTeammateAllocatedHours } from './queries'
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
  /** `memberships.default_rate` — seeds an allocation's bill rate. Null until someone sets it. */
  defaultRate: number | null
  /** `memberships.cost_rate` — internal. Carried for margin, never shown to a client. */
  costRate: number | null
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

export async function createTimeEntry(
  rawInput: unknown
): Promise<ActionResult> {
  const parsed = createTimeEntrySchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) }
  }

  const params = parsed.data
  const supabase = await createClient()

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

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'create_time_entry_with_capacity_check',
    {
      p_user_id: user.id,
      p_project_id: params.projectId,
      p_milestone_id: (params.milestoneId || null) as string,
      p_work_date: params.workDate,
      p_duration_minutes: durationMinutes,
      p_description: params.description.trim(),
      p_org_id: project.org_id,
    }
  )

  if (rpcError) {
    console.error('Create Time Entry RPC Error:', rpcError.message)
    return { ok: false, error: 'Failed to record time entry.' }
  }

  const result = rpcResult as { ok: boolean; error?: string; id?: string }

  if (!result?.ok) {
    return {
      ok: false,
      error: result?.error || 'Exceeds daily capacity.',
    }
  }

  revalidatePath(`/${params.orgSlug}`)
  return { ok: true }
}

const memberRateValue = z
  .number({ error: 'Rate must be a number' })
  .positive('Rate must be greater than 0')
  .nullable()
  .optional()

const memberRatesSchema = z.object({
  orgSlug: z.string().min(1, 'Organization slug is required'),
  userId: z.uuid('Invalid teammate ID'),
  defaultRate: memberRateValue,
  costRate: memberRateValue,
})

export async function updateMemberRatesAction(
  rawParams: unknown
): Promise<ActionResult> {
  const parsed = memberRatesSchema.safeParse(rawParams)
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) }
  }

  const { orgSlug, userId, defaultRate, costRate } = parsed.data

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }

  const isAdmin = await isAdminRole(workspace.role)
  if (!isAdmin) {
    return {
      ok: false,
      error: 'Unauthorized: Only administrators can set teammate rates.',
    }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('set_member_rates', {
    target_user_id: userId,
    target_org_id: workspace.id,
    new_default_rate: defaultRate ?? undefined,
    new_cost_rate: costRate ?? undefined,
  })

  if (error) {
    console.error('set_member_rates RPC error:', error.message)
    return { ok: false, error: 'Failed to save rates.' }
  }

  revalidatePath(`/${orgSlug}`)
  return { ok: true }
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
    client_org_id: params.clientId || null,
    contract_value: params.budget ?? null,
    estimated_hours: params.estimatedHours ?? null,
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
