import { createClient } from '@/lib/supabase/server'
import { TimeEntry } from '../types'

export async function getProjectTimeEntries(
  projectId: string
): Promise<TimeEntry[]> {
  const supabase = await createClient()

  const { data: entries, error } = await supabase
    .from('time_entries')
    .select(
      `
      id,
      user_id,
      project_id,
      milestone_id,
      work_date,
      duration_minutes,
      description,
      status,
      created_at
    `
    )
    .eq('project_id', projectId)
    .order('work_date', { ascending: false })

  if (error || !entries) {
    console.error('Error fetching time entries:', error)
    return []
  }

  return entries.map((item) => ({
    id: item.id,
    userId: item.user_id,
    projectId: item.project_id,
    milestoneId: item.milestone_id,
    workDate: item.work_date,
    durationMinutes: item.duration_minutes,
    description: item.description,
    status: item.status,
    createdAt: item.created_at,
  }))
}

export async function getMonthlyLoggedHours(
  projectId: string
): Promise<number> {
  const supabase = await createClient()

  const now = new Date()
  const firstDayStr = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const lastDayStr = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0]

  const { data: entries, error } = await supabase
    .from('time_entries')
    .select('duration_minutes')
    .eq('project_id', projectId)
    .neq('status', 'rejected')
    .gte('work_date', firstDayStr)
    .lte('work_date', lastDayStr)

  if (error || !entries) {
    console.error('Error fetching monthly logged hours:', error)
    return 0
  }

  const totalMinutes = entries.reduce(
    (acc, item) => acc + (item.duration_minutes || 0),
    0
  )

  return Number((totalMinutes / 60).toFixed(1))
}
