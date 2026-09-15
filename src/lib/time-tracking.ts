import { createClient } from '@/lib/supabase/server'

export async function getLoggedMinutesForDate(
  userId: string,
  workDate: string,
  orgId?: string
): Promise<number> {
  const supabase = await createClient()

  let query = supabase
    .from('time_entries')
    .select('duration_minutes, projects!inner(org_id)')
    .eq('user_id', userId)
    .eq('work_date', workDate)

  if (orgId) {
    query = query.eq('projects.org_id', orgId)
  }

  const { data, error } = await query

  if (error || !data) {
    console.error('Failed to fetch logged minutes:', error)
    return 0
  }

  return data.reduce((total, entry) => total + (entry.duration_minutes ?? 0), 0)
}
