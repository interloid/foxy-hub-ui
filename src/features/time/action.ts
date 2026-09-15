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
  targetStatus: TimeEntryStatus
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

  const { data, error } = await supabase
    .from('time_entries')
    .update({ status: targetStatus })
    .in('id', idsToUpdate)
    .select('id')

  if (error) {
    console.error('Error updating time entries status:', error)
    return { success: false, updatedCount: 0, error: error.message }
  }

  revalidatePath('/dashboard')

  return {
    success: true,
    updatedCount: data?.length || 0,
  }
}

export async function submitAllDraftEntries(
  entryIds: string[]
): Promise<UpdateStatusResult> {
  return updateTimeEntriesStatus(entryIds, 'submitted')
}
