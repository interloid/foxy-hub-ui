'use server'

import { createProjectPayloadSchema } from '@/features/projects/components/new-project/payload'
import { getTeammateAllocatedHours } from '@/features/dashboard/queries'
import { getWorkspace, isAdminRole } from '@/lib/dal'
import { PROJECT_OWNER_ROLES, STAFF_ROLES } from '@/lib/role'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '../onboarding/types'

type ProjectInsert = Database['public']['Tables']['projects']['Insert']

// Creates a project from the full-page New project wizard: the project, its team
// allocations and its milestones in one `create_project_with_allocations` transaction.
export async function createProjectFromWizard(
  orgSlug: string,
  rawPayload: unknown
): Promise<ActionResult<{ projectId: string }>> {
  if (!orgSlug || typeof orgSlug !== 'string') {
    return { ok: false, error: 'Organization slug is required.' }
  }

  const parsed = createProjectPayloadSchema.safeParse(rawPayload)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid project details.',
    }
  }
  const payload = parsed.data

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) {
    return { ok: false, error: 'Workspace not found or access denied.' }
  }
  if (!isAdminRole(workspace.role)) {
    return { ok: false, error: 'Only administrators can create projects.' }
  }

  const supabase = await createClient()

  // The RPC is security definer, so ids from the browser are checked against THIS org here:
  // a client or teammate from another workspace must not be attachable to the project.
  if (payload.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', payload.clientId)
      .eq('org_id', workspace.id)
      .eq('status', true)
      .maybeSingle()
    if (!client) return { ok: false, error: 'That client was not found.' }
  }

  const allocationUserIds = [
    ...new Set(payload.allocations.map((a) => a.userId)),
  ]
  if (allocationUserIds.length > 0) {
    const { data: staff, error } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('org_id', workspace.id)
      .eq('status', true)
      .in('role', [...STAFF_ROLES])
      .in('user_id', allocationUserIds)

    if (error || (staff ?? []).length !== allocationUserIds.length) {
      return {
        ok: false,
        error: 'Every teammate must be an active member of this workspace.',
      }
    }
  }

  // Only a primary admin, admin or manager can own a project. The RPC also checks the
  // owner is active staff, but it still accepts contributors.
  if (payload.ownerId) {
    const { data: owner } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('org_id', workspace.id)
      .eq('user_id', payload.ownerId)
      .eq('status', true)
      .in('role', [...PROJECT_OWNER_ROLES])
      .maybeSingle()
    if (!owner) {
      return {
        ok: false,
        error: 'The project owner must be a primary admin, admin or manager.',
      }
    }
  }

  // Over-commitment: the same rule the wizard shows, re-checked against live data.
  const { data: org } = await supabase
    .from('organizations')
    .select('daily_capacity_hours')
    .eq('id', workspace.id)
    .maybeSingle()
  const maxDailyCapacity = org?.daily_capacity_hours ?? 8

  if (!payload.overrideReason) {
    for (const alloc of payload.allocations) {
      const { existingHoursPerDay } = await getTeammateAllocatedHours(
        alloc.userId,
        orgSlug,
        alloc.effectiveFrom
      )
      if (existingHoursPerDay + alloc.hoursPerDay > maxDailyCapacity) {
        return {
          ok: false,
          error: `An override reason is required - this allocation goes past ${maxDailyCapacity} h/day.`,
        }
      }
    }
  }

  const projectData: ProjectInsert = {
    org_id: workspace.id,
    name: payload.name,
    client_org_id: payload.clientId,
    owner_id: payload.ownerId,
    start_date: payload.startDate,
    due_date: payload.dueDate,
    scope_in: payload.scopeIn,
    scope_out: payload.scopeOut,
    done_when: payload.doneWhen,
    sign_off_by: payload.signOffBy,
    update_cadence: payload.updateCadence,
    engagement: payload.engagement,
    contract_value: payload.contractValue,
    estimated_hours: payload.estimatedHours,
    retainer_amount: payload.retainerAmount,
    retainer_hours: payload.retainerHours,
    retainer_period: payload.retainerPeriod,
    retainer_overage: payload.retainerOverage,
    description: payload.description,
    override_reason: payload.overrideReason,
    start_from: 'blank',
    status: 'pending',
  }

  const allocationsData = payload.allocations.map((a) => ({
    user_id: a.userId,
    hours_per_day: a.hoursPerDay,
    days_per_week: a.daysPerWeek,
    rate: a.rate,
    effective_from: a.effectiveFrom,
  }))

  const milestonesData = payload.milestones.map((m) => ({
    title: m.title,
    due_date: m.dueDate,
    estimated_hours: m.estimatedHours,
    client_visible: m.clientVisible,
  }))

  const { data: projectId, error: rpcError } = await supabase.rpc(
    'create_project_with_allocations',
    {
      project_data: projectData,
      allocations_data: allocationsData,
      milestones_data: milestonesData,
    }
  )

  if (rpcError || !projectId) {
    console.error(
      'create_project_with_allocations RPC error:',
      rpcError?.message
    )
    // The RPC's own owner check has a message worth showing as-is.
    if (rpcError?.code === '22023') {
      return { ok: false, error: rpcError.message }
    }
    return { ok: false, error: 'Failed to create the project.' }
  }

  revalidatePath(`/${orgSlug}`)
  revalidatePath(`/${orgSlug}/projects`)
  return { ok: true, data: { projectId } }
}
