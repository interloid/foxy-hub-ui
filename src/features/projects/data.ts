'use server'
import { createClient } from '@/lib/supabase/server'
import { TimeEntryItem } from './components/time-tracking/time-entries-card'
import type {
  ClientItem,
  HoursSummaryData,
  ProjectAllocationItem,
} from './types'

export async function getProjectAllocations(
  projectId: string
): Promise<ProjectAllocationItem[]> {
  const supabase = await createClient()

  // 1. Fetch project allocations
  const { data: allocations, error } = await supabase
    .from('project_allocations')
    .select(
      `
      id,
      project_id,
      user_id,
      hours_per_day,
      days_per_week,
      rate,
      effective_from,
      effective_to
    `
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(5)

  if (error || !allocations) {
    console.error('Error fetching project allocations:', error)
    return []
  }

  // 2. Extract unique user IDs and fetch profile names
  const userIds = Array.from(
    new Set(
      allocations
        .map((a) => a.user_id)
        .filter((id): id is string => Boolean(id))
    )
  )

  const { data: profiles } = userIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds)
    : { data: [] }

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) || [])

  return allocations.map((item) => {
    const profile = profileMap.get(item.user_id)
    return {
      id: item.id,
      projectId: item.project_id,
      userId: item.user_id,
      userName: profile?.full_name || 'Team Member',
      userAvatarUrl: profile?.avatar_url || null,
      hoursPerDay: Number(item.hours_per_day),
      daysPerWeek: item.days_per_week,
      rate: item.rate !== null ? Number(item.rate) : null,
      effectiveFrom: item.effective_from,
      effectiveTo: item.effective_to,
    }
  })
}

export async function getClientByProjectId(
  projectId?: string | null
): Promise<ClientItem | null> {
  if (!projectId) {
    return null
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('projects')
    .select(
      `
      client:clients!inner (
        id,
        org_id,
        name,
        contact_name,
        contact_email
      )
    `
    )
    .eq('id', projectId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching client by project ID:', {
      message: error.message,
      details: error.details,
      code: error.code,
    })
    return null
  }

  // Handle nested object or array payload returned from Supabase join
  const rawClient = Array.isArray(data?.client) ? data.client[0] : data?.client

  if (!rawClient) {
    return null
  }

  return {
    id: rawClient.id,
    orgId: rawClient.org_id,
    name: rawClient.name,
    contactName: rawClient.contact_name,
    contactEmail: rawClient.contact_email,
  }
}

export async function createProjectUpdate({
  projectId,
  authorId,
  body,
}: {
  projectId: string
  authorId: string
  body: string
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('updates')
    .insert({
      project_id: projectId,
      author_id: authorId,
      body,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating update:', error)
    throw new Error('Failed to post project update')
  }

  return data
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
