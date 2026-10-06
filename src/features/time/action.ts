'use server'

import { actorNameOf, logActivity } from '@/lib/activity'
import { getWorkspace } from '@/lib/dal'
import { formatMinutes } from '@/lib/duration'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface UpdateStatusResult {
  success: boolean
  updatedCount: number
  error?: string
}

export async function updateTimeEntriesStatus(
  entryIds: string | string[],
  targetStatus: TimeEntryStatus,
  orgSlug: string
): Promise<UpdateStatusResult> {
  const idsToUpdate = Array.isArray(entryIds) ? entryIds : [entryIds]

  if (idsToUpdate.length === 0) {
    return { success: true, updatedCount: 0 }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, updatedCount: 0, error: 'Unauthorized' }
  }

  // Map each status transition to its dedicated RPC function
  const rpcMap: Partial<
    Record<
      TimeEntryStatus,
      'submit_time_entry' | 'approve_time_entry' | 'reject_time_entry'
    >
  > = {
    submitted: 'submit_time_entry',
    approved: 'approve_time_entry',
    rejected: 'reject_time_entry',
  }

  const rpcName = rpcMap[targetStatus]
  if (!rpcName) {
    return {
      success: false,
      updatedCount: 0,
      error: `Unsupported target status transition to '${targetStatus}'`,
    }
  }

  // Execute RPC for each entry ID
  const results = await Promise.all(
    idsToUpdate.map((id) => supabase.rpc(rpcName, { entry_id: id }))
  )

  // Check if any RPC call failed
  const failedResult = results.find((res) => res.error)
  if (failedResult?.error) {
    console.error(
      'Error updating time entries status via RPC:',
      failedResult.error
    )
    return {
      success: false,
      updatedCount: 0,
      error: failedResult.error.message,
    }
  }

  if (targetStatus === 'approved' || targetStatus === 'rejected') {
    await logReviewedEntries(supabase, user.id, idsToUpdate, targetStatus)
  } else if (targetStatus === 'submitted') {
    await logSubmittedEntries(supabase, user.id, idsToUpdate)
  }

  revalidatePath(`/${orgSlug}/time`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return {
    success: true,
    updatedCount: idsToUpdate.length,
  }
}

/**
 * One feed line per project and person - "Ana approved 6 entries · Marcus Lee" - rather than
 * one per entry, so a bulk approval doesn't bury the rest of the project's activity.
 */
async function logReviewedEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reviewerId: string,
  entryIds: string[],
  status: 'approved' | 'rejected'
) {
  const { data: entries, error } = await supabase
    .from('time_entries')
    .select('user_id, project_id, projects!inner(org_id)')
    .in('id', entryIds)

  if (error || !entries?.length) {
    if (error) console.error('time entry activity lookup:', error.message)
    return
  }

  const groups = new Map<
    string,
    { orgId: string; projectId: string; userId: string; count: number }
  >()
  for (const e of entries) {
    const key = `${e.project_id}:${e.user_id}`
    const group = groups.get(key)
    if (group) group.count += 1
    else
      groups.set(key, {
        orgId: e.projects.org_id,
        projectId: e.project_id,
        userId: e.user_id,
        count: 1,
      })
  }

  const reviewer = await actorNameOf(supabase, reviewerId)
  const { data: people } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', [...new Set(entries.map((e) => e.user_id))])
  const nameOf = new Map(
    (people ?? []).map((p) => [p.id, p.full_name?.trim() || 'a teammate'])
  )

  for (const g of groups.values()) {
    const entriesLabel = g.count === 1 ? '1 entry' : `${g.count} entries`
    await logActivity(supabase, {
      orgId: g.orgId,
      actorId: reviewerId,
      actorKind: 'member',
      type: status === 'approved' ? 'time_approved' : 'time_rejected',
      summary: `${reviewer} ${status} ${entriesLabel} · ${nameOf.get(g.userId) ?? 'a teammate'}`,
      projectId: g.projectId,
      entityType: 'time_entry',
      payload: { count: g.count, user_id: g.userId },
      // Both RPCs only act on a submitted entry, so that is what each one was.
      changes: [
        {
          label: 'Status',
          from: 'Submitted',
          to: status === 'approved' ? 'Approved' : 'Rejected',
        },
      ],
    })
  }
}

/**
 * "Marcus Lee submitted 6 entries (14h 30m) for approval on Bloom" - one line per project,
 * like approvals. `submit_time_entry` only moves the caller's own drafts, so every entry
 * here is the submitter's and was a draft.
 */
async function logSubmittedEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  entryIds: string[]
) {
  const { data: entries, error } = await supabase
    .from('time_entries')
    .select('project_id, duration_minutes, projects!inner(org_id, name)')
    .in('id', entryIds)

  if (error || !entries?.length) {
    if (error) console.error('time entry activity lookup:', error.message)
    return
  }

  const groups = new Map<
    string,
    { orgId: string; projectName: string; count: number; minutes: number }
  >()
  for (const e of entries) {
    const group = groups.get(e.project_id)
    if (group) {
      group.count += 1
      group.minutes += e.duration_minutes ?? 0
    } else {
      groups.set(e.project_id, {
        orgId: e.projects.org_id,
        projectName: e.projects.name,
        count: 1,
        minutes: e.duration_minutes ?? 0,
      })
    }
  }

  const submitter = await actorNameOf(supabase, userId)
  for (const [projectId, g] of groups) {
    const entriesLabel = g.count === 1 ? '1 entry' : `${g.count} entries`
    await logActivity(supabase, {
      orgId: g.orgId,
      actorId: userId,
      actorKind: 'member',
      type: 'time_submitted',
      summary: `${submitter} submitted ${entriesLabel} (${formatMinutes(g.minutes)}) for approval on ${g.projectName}`,
      projectId,
      entityType: 'time_entry',
      payload: { count: g.count, minutes: g.minutes },
      changes: [{ label: 'Status', from: 'Draft', to: 'Submitted' }],
    })
  }
}

export async function submitAllDraftEntries(
  entryIds: string[],
  orgSlug: string
): Promise<UpdateStatusResult> {
  return updateTimeEntriesStatus(entryIds, 'submitted', orgSlug)
}

export interface DayCapacity {
  dailyCapacityHours: number
  alreadyLoggedMinutes: number
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The Log time page's capacity check for one day. Uses the SAME rule as
 * `create_time_entry_with_capacity_check`: the workspace's daily capacity, against
 * everything the user has logged that day across all of the workspace's projects (every
 * status, as the function counts them). Showing anything else would let the page accept a
 * duration the save then rejects.
 */
export async function getDayCapacity(
  orgSlug: string,
  workDate: string
): Promise<DayCapacity | null> {
  if (!orgSlug || !ISO_DATE.test(workDate)) return null

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [orgRes, entriesRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('daily_capacity_hours')
      .eq('id', workspace.id)
      .maybeSingle(),
    supabase
      .from('time_entries')
      .select('duration_minutes, projects!inner(org_id)')
      .eq('user_id', user.id)
      .eq('work_date', workDate)
      .eq('projects.org_id', workspace.id),
  ])

  if (entriesRes.error) {
    console.error('getDayCapacity entries:', entriesRes.error.message)
    return null
  }

  return {
    dailyCapacityHours: Number(orgRes.data?.daily_capacity_hours ?? 8),
    alreadyLoggedMinutes: (entriesRes.data ?? []).reduce(
      (sum, e) => sum + (e.duration_minutes || 0),
      0
    ),
  }
}
