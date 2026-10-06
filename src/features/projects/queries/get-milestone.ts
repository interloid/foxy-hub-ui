import { createClient } from '@/lib/supabase/server'
import { MilestoneItem } from '../types/milestone'

export async function getProjectMilestones(
  projectId: string
): Promise<MilestoneItem[]> {
  const supabase = await createClient()

  const { data: milestones, error } = await supabase
    .from('milestones')
    .select('id, project_id, title, due_date, status, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error || !milestones) {
    console.error('Error fetching milestones:', error)
    return []
  }

  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('milestone_id, duration_minutes')
    .eq('project_id', projectId)
    .neq('status', 'rejected')

  const timeMap = new Map<string, number>()
  timeEntries?.forEach((entry) => {
    if (entry.milestone_id) {
      const current = timeMap.get(entry.milestone_id) || 0
      timeMap.set(entry.milestone_id, current + entry.duration_minutes)
    }
  })

  return milestones.map((m) => ({
    id: m.id,
    projectId: m.project_id,
    title: m.title,
    dueDate: m.due_date,
    status: m.status,
    loggedMinutes: timeMap.get(m.id) || 0,
  }))
}
