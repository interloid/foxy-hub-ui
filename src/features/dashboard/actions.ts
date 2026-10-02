'use server'

import { getWorkspace, isAdminRole } from '@/lib/dal'
import { parseDurationToMinutes } from '@/lib/duration'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ActionResult } from '../onboarding/types'

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
  // The Log time page's toggle. Optional so older callers keep logging billable time.
  billable: z.boolean().default(true),
})

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
      p_billable: params.billable,
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
  revalidatePath(`/${params.orgSlug}/time`)
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

  // Cost rate is the primary admin's alone. For anyone else it is not sent at all, and
  // set_member_rates leaves the stored cost rate untouched.
  const canSetCost = workspace.role === 'primary_admin'

  const { error } = await supabase.rpc('set_member_rates', {
    target_user_id: userId,
    target_org_id: workspace.id,
    new_default_rate: defaultRate ?? undefined,
    new_cost_rate: canSetCost ? (costRate ?? undefined) : undefined,
  })

  if (error) {
    console.error('set_member_rates RPC error:', error.message)
    return { ok: false, error: 'Failed to save rates.' }
  }

  revalidatePath(`/${orgSlug}`)
  // The Edit member sheet saves rates through here too, so the People page must re-read them.
  revalidatePath(`/${orgSlug}/people`)
  return { ok: true }
}
