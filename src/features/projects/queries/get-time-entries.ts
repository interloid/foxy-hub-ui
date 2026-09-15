import { createClient } from '@/lib/supabase/server'
import { HoursSummaryData, TimeEntry } from '../types'
import { TimeEntryItem } from '../types/time-entries'

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

export async function getCurrentUser() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null }
  return !profile ? null : { ...profile, email: user?.email }
}

export async function getProjectHoursSummary(
  projectId: string
): Promise<HoursSummaryData> {
  const supabase = await createClient()

  // Calculate start of current month in YYYY-MM-DD
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const today = now.toISOString().split('T')[0]

  const { data: entries, error } = await supabase
    .from('time_entries')
    .select('duration_minutes, status')
    .eq('project_id', projectId)
    .gte('work_date', startOfMonth)
    .lte('work_date', today)

  if (error || !entries) {
    console.error('Error fetching time entries:', error)
    return { loggedMinutes: 0, approvedMinutes: 0, pendingMinutes: 0 }
  }

  return entries.reduce(
    (acc, entry) => {
      const minutes = entry.duration_minutes || 0

      acc.loggedMinutes += minutes

      if (entry.status === 'approved') {
        acc.approvedMinutes += minutes
      } else if (entry.status === 'submitted') {
        acc.pendingMinutes += minutes
      }

      return acc
    },
    { loggedMinutes: 0, approvedMinutes: 0, pendingMinutes: 0 }
  )
}

export async function getRecentProjectTimeEntries(
  projectId: string
): Promise<TimeEntryItem[]> {
  const supabase = await createClient()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const today = now.toISOString().split('T')[0]

  const { data: entries, error: entriesError } = await supabase
    .from('time_entries')
    .select(
      `
      id,
      user_id,
      work_date,
      created_at,
      duration_minutes,
      description,
      project_id,
      user_id,
      status,
      milestone:milestones(title)
    `
    )
    .eq('project_id', projectId)
    .gte('work_date', startOfMonth)
    .lte('work_date', today)
    .order('work_date', { ascending: false })
    .limit(5)
  if (entriesError || !entries || entries.length === 0) {
    if (entriesError) {
      console.error('Error fetching project time entries:', entriesError)
    }
    return []
  }

  // 2. Extract unique user IDs for the separate call
  const userIds = Array.from(new Set(entries.map((entry) => entry.user_id)))

  // 3. Separate call to fetch profiles for those users
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError)
  }

  // Create a look-up map for fast profile retrieval
  const profileMap = new Map<string, { full_name: string | null }>()
  profiles?.forEach((profile) => {
    profileMap.set(profile.id, profile)
  })

  // 4. Combine entries and profile data
  return entries.map((entry) => {
    const userProfile = profileMap.get(entry.user_id)
    const fullName = userProfile?.full_name || 'Team Member'
    const initials = fullName
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()

    // Handle single element milestone object returned by Supabase foreign relation
    const milestoneObj = Array.isArray(entry.milestone)
      ? entry.milestone[0]
      : entry.milestone

    return {
      id: entry.id,
      workDate: entry.work_date,
      durationMinutes: entry.duration_minutes,
      description: entry.description,
      status: entry.status,
      milestoneTitle: milestoneObj?.title || null,
      authorName: fullName,
      authorInitials: initials,
      createdAt: entry.created_at,
      projectId: entry.project_id,
      userId: entry.user_id,
    }
  })
}
