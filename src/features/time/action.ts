'use server'

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
