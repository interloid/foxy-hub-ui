'use server'

import { startOfWeekIn } from '@/lib/date'
import { getUserTimeZone } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import {
  PendingApprovalEntry,
  UserPendingApprovals,
  WeeklyTimeEntryItem,
  WeeklyTimeSummary,
} from '../types'

export async function getWeeklyTimeSummary(
  orgId: string,
  projectId?: string
): Promise<WeeklyTimeSummary> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('Unauthorized or error fetching user:', userError)
    return {
      loggedThisWeekMinutes: 0,
      approvedMinutes: 0,
      pendingReviewMinutes: 0,
      draftMinutes: 0,
      pendingApprovalsCount: 0,
    }
  }

  // Monday in the USER's zone — the server's own clock is UTC.
  const startOfWeekStr = startOfWeekIn(await getUserTimeZone())

  let query = supabase
    .from('time_entries')
    .select(
      `status, duration_minutes,
      projects!inner (
        org_id
      )
      `
    )
    .eq('user_id', user.id)
    .eq('projects.org_id', orgId)
    .gte('work_date', startOfWeekStr)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data: entries, error } = await query

  if (error || !entries) {
    console.error('Error fetching weekly time summary:', error)
    return {
      loggedThisWeekMinutes: 0,
      approvedMinutes: 0,
      pendingReviewMinutes: 0,
      draftMinutes: 0,
      pendingApprovalsCount: 0,
    }
  }

  return entries.reduce(
    (acc, entry) => {
      const minutes = entry.duration_minutes || 0
      acc.loggedThisWeekMinutes += minutes

      switch (entry.status) {
        case 'approved':
          acc.approvedMinutes += minutes
          break
        case 'submitted':
          acc.pendingReviewMinutes += minutes
          acc.pendingApprovalsCount += 1
          break
        case 'draft':
          acc.draftMinutes += minutes
          break
        default:
          break
      }

      return acc
    },
    {
      loggedThisWeekMinutes: 0,
      approvedMinutes: 0,
      pendingReviewMinutes: 0,
      draftMinutes: 0,
      pendingApprovalsCount: 0,
    }
  )
}

export async function getWeeklyTimeEntries(
  orgId: string,
  projectId?: string
): Promise<WeeklyTimeEntryItem[]> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('Unauthorized or error fetching user:', userError)
    return []
  }

  // Monday in the USER's zone — the server's own clock is UTC.
  const startOfWeekStr = startOfWeekIn(await getUserTimeZone())

  let query = supabase
    .from('time_entries')
    .select(
      `
      id,
      work_date,
      duration_minutes,
      description,
      status,
      project:projects(name)
    `
    )
    .eq('user_id', user.id)
    .eq('project.org_id', orgId)
    .gte('work_date', startOfWeekStr)
    .order('work_date', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data: entries, error } = await query

  if (error || !entries) {
    console.error('Error fetching weekly time entries:', error)
    return []
  }

  return entries.map((entry) => {
    const projectObj = Array.isArray(entry.project)
      ? entry.project[0]
      : entry.project

    return {
      id: entry.id,
      workDate: entry.work_date,
      projectName: projectObj?.name || 'General Project',
      description: entry.description,
      durationMinutes: entry.duration_minutes,
      status: entry.status,
    }
  })
}

export async function getPendingApprovals(
  orgId: string,
  projectId?: string
): Promise<UserPendingApprovals[]> {
  const supabase = await createClient()

  // 1. Get current authenticated user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('Unauthorized or error fetching user:', userError)
    return []
  }

  // 2. Calculate Start of Current Week (Monday 00:00:00)
  // Monday in the USER's zone — the server's own clock is UTC.
  const startOfWeekStr = startOfWeekIn(await getUserTimeZone())

  // 3. Query all submitted entries for the week
  let entriesQuery = supabase
    .from('time_entries')
    .select(
      `
      id,
      user_id,
      work_date,
      duration_minutes,
      description,
      project:projects(name)
    `
    )
    .eq('status', 'submitted')
    .eq('project.org_id', orgId)
    .gte('work_date', startOfWeekStr)
    .order('work_date', { ascending: false })

  if (projectId) {
    entriesQuery = entriesQuery.eq('project_id', projectId)
  }

  const { data: entries, error: entriesError } = await entriesQuery

  if (entriesError || !entries || entries.length === 0) {
    return []
  }

  // 4. Extract unique user IDs from submitted entries
  const userIds = Array.from(new Set(entries.map((item) => item.user_id)))

  // 5. Query profiles separately without relational joins
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds)

  if (profilesError) {
    console.error('Error fetching user profiles:', profilesError)
  }

  const profileMap = new Map<
    string,
    { full_name: string; avatar_url: string | null }
  >()
  profiles?.forEach((prof) => {
    profileMap.set(prof.id, {
      full_name: prof.full_name || 'Unknown User',
      avatar_url: prof.avatar_url || null,
    })
  })

  // 6. Group entries by user
  const groupedMap = new Map<string, UserPendingApprovals>()

  entries.forEach((entry) => {
    const entryUserId = entry.user_id
    const userProfile = profileMap.get(entryUserId)
    const projectObj = Array.isArray(entry.project)
      ? entry.project[0]
      : entry.project

    const formattedEntry: PendingApprovalEntry = {
      id: entry.id,
      workDate: entry.work_date,
      projectName: projectObj?.name || 'General',
      description: entry.description,
      durationMinutes: entry.duration_minutes || 0,
    }

    if (!groupedMap.has(entryUserId)) {
      groupedMap.set(entryUserId, {
        userId: entryUserId,
        fullName: userProfile?.full_name || 'Unknown User',
        avatarUrl: userProfile?.avatar_url || null,
        totalEntriesCount: 0,
        totalAwaitingMinutes: 0,
        entries: [],
      })
    }

    const group = groupedMap.get(entryUserId)!
    group.entries.push(formattedEntry)
    group.totalEntriesCount += 1
    group.totalAwaitingMinutes += entry.duration_minutes || 0
  })

  return Array.from(groupedMap.values())
}
