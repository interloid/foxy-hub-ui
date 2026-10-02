import 'server-only'

import type { LogTimePageData } from '@/features/time/components/log-time/types'
import { getProjectsForOrg } from '@/features/dashboard/queries'
import { getUserTimeZone, verifySession, type WorkspaceDTO } from '@/lib/dal'
import { shiftISODate, startOfWeekIn, todayIn } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const RECENT_LIMIT = 3

// Everything the Log time page shows around the form. Projects are the ones the user is
// allocated to today - the same list the old Log time sheet offered.
export async function getLogTimePageData(
  workspace: WorkspaceDTO
): Promise<LogTimePageData | null> {
  const session = await verifySession()
  if (!session) return null

  const supabase = await createClient()
  const timeZone = await getUserTimeZone()
  const today = todayIn(timeZone)
  const weekStart = startOfWeekIn(timeZone)
  const weekEnd = shiftISODate(weekStart, 6)

  const allocated = await getProjectsForOrg(workspace.slug, true)
  const projectOptions = allocated?.projects ?? []
  const projectIds = projectOptions.map((p) => p.id)

  const [projectsRes, milestonesRes, approvedRes, weekRes, recentRes] =
    await Promise.all([
      projectIds.length
        ? supabase
            .from('projects')
            .select('id, engagement, estimated_hours, retainer_hours')
            .in('id', projectIds)
        : Promise.resolve({ data: [], error: null }),
      projectIds.length
        ? supabase
            .from('milestones')
            .select('id, project_id, title')
            .in('project_id', projectIds)
            .order('position', { ascending: true })
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      // RLS decides whose hours these are: every teammate's for admins and managers,
      // only the user's own for a contributor.
      projectIds.length
        ? supabase
            .from('time_entries')
            .select('project_id, duration_minutes')
            .in('project_id', projectIds)
            .eq('status', 'approved')
            // Matches the card's copy: billable hours land here once approved.
            .eq('billable', true)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('time_entries')
        .select('work_date, duration_minutes, projects!inner(org_id)')
        .eq('user_id', session.id)
        .eq('projects.org_id', workspace.id)
        .neq('status', 'rejected')
        .gte('work_date', weekStart)
        .lte('work_date', weekEnd),
      projectIds.length
        ? supabase
            .from('time_entries')
            .select('project_id, milestone_id, description')
            .eq('user_id', session.id)
            .in('project_id', projectIds)
            .order('created_at', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [], error: null }),
    ])

  for (const [label, res] of [
    ['projects', projectsRes],
    ['milestones', milestonesRes],
    ['approved hours', approvedRes],
    ['week', weekRes],
    ['recent entries', recentRes],
  ] as const) {
    if (res.error)
      console.error(`getLogTimePageData ${label}:`, res.error.message)
  }

  const detailsById = new Map((projectsRes.data ?? []).map((p) => [p.id, p]))

  const milestonesByProject = new Map<string, { id: string; title: string }[]>()
  for (const m of milestonesRes.data ?? []) {
    const list = milestonesByProject.get(m.project_id) ?? []
    list.push({ id: m.id, title: m.title })
    milestonesByProject.set(m.project_id, list)
  }

  const approvedByProject = new Map<string, number>()
  for (const e of approvedRes.data ?? []) {
    approvedByProject.set(
      e.project_id,
      (approvedByProject.get(e.project_id) ?? 0) + (e.duration_minutes || 0)
    )
  }

  const projects = projectOptions.map((p) => {
    const details = detailsById.get(p.id)
    const planned =
      details?.engagement === 'retainer'
        ? details.retainer_hours
        : details?.estimated_hours
    return {
      id: p.id,
      name: p.name,
      milestones: milestonesByProject.get(p.id) ?? [],
      approvedMinutes: approvedByProject.get(p.id) ?? 0,
      plannedHours:
        planned !== null && planned !== undefined ? Number(planned) : null,
    }
  })

  const minutesByDate = new Map<string, number>()
  let weekTotalMinutes = 0
  for (const e of weekRes.data ?? []) {
    const minutes = e.duration_minutes || 0
    weekTotalMinutes += minutes
    minutesByDate.set(
      e.work_date,
      (minutesByDate.get(e.work_date) ?? 0) + minutes
    )
  }

  const week = WEEKDAY_LABELS.map((label, i) => {
    const date = shiftISODate(weekStart, i)
    return {
      date,
      label,
      minutes: minutesByDate.get(date) ?? 0,
      isToday: date === today,
      isFuture: date > today,
    }
  })

  // "Log it again": the latest distinct project + milestone + description combinations.
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const recent: LogTimePageData['recent'] = []
  for (const e of recentRes.data ?? []) {
    const description = e.description?.trim()
    const project = projectById.get(e.project_id)
    if (!description || !project) continue

    const key = `${e.project_id}|${e.milestone_id ?? ''}|${description.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    recent.push({
      projectId: project.id,
      projectName: project.name,
      milestoneId: e.milestone_id,
      milestoneTitle:
        project.milestones.find((m) => m.id === e.milestone_id)?.title ?? null,
      description,
    })
    if (recent.length === RECENT_LIMIT) break
  }

  return {
    projects,
    week,
    weekTotalMinutes,
    recent,
    today,
    seesAllHours: ['primary_admin', 'admin', 'manager'].includes(
      workspace.role
    ),
  }
}
