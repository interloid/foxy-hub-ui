'use server'

import { getWorkspace } from '@/lib/dal'
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

  revalidatePath(`/${orgSlug}/time`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return {
    success: true,
    updatedCount: idsToUpdate.length,
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
