import { createClient } from '@/lib/supabase/server'
import { TimeEntryItem } from './components/time-entries-card'
import type {
  ClientItem,
  DeliverableItem,
  EngagementModel,
  HoursSummaryData,
  MilestoneItem,
  Project,
  ProjectAllocationItem,
  ProjectMetrics,
  ProjectUpdate,
  TimeEntry,
} from './types'
import {
  InvoiceLine,
  ProjectInvoiceContext,
} from './components/new-invoice-sheet'

export async function getProjectsData(orgSlug: string): Promise<{
  projects: Project[]
  metrics: ProjectMetrics
}> {
  const supabase = await createClient()

  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (orgError) {
    console.error('Organization not found')
  }
  // Fetch projects directly from public.projects
  const { data: rawProjects, error } = await supabase
    .from('projects')
    .select(
      `
      id,
      org_id,
      name,
      client_id,
      description,
      status,
      start_date,
      start_from,
      due_date,
      created_at,
      updated_at,
      engagement,
      contract_value,
      retainer_hours,
      retainer_period,
      retainer_amount,
      retainer_overage,
      override_reason
    `
    )
    .eq('org_id', orgData?.id ?? orgSlug)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching projects:', error)
    return {
      projects: [],
      metrics: {
        totalProjects: 0,
        activeProjects: 0,
        delayedProjects: 0,
        completedThisMonth: 0,
      },
    }
  }

  const projects: Project[] = (rawProjects || []).map((p) => {
    return {
      id: p.id,
      orgId: p.org_id,
      name: p.name,
      code: `PRJ-${p.id.substring(0, 4).toUpperCase()}`,
      clientId: p.client_id,
      clientName: p.client_id ? 'Assigned Client' : 'Internal Project',
      description: p.description ?? null,
      status: p.status,
      startDate: p.start_date ?? null,
      startFrom: p.start_from ?? null,
      dueDate: p.due_date ?? null,
      engagement: p.engagement,
      contractValue: p.contract_value ? Number(p.contract_value) : null,
      retainerHours: p.retainer_hours ? Number(p.retainer_hours) : null,
      retainerPeriod: p.retainer_period ?? null,
      retainerAmount: p.retainer_amount ? Number(p.retainer_amount) : null,
      retainerOverage: p.retainer_overage ? Number(p.retainer_overage) : null,
      overrideReason: p.override_reason ?? null,
      createdAt: p.created_at,
      updatedAt: p.updated_at || p.created_at,
      progressPercent: 0,
      members: [],
    }
  })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const metrics: ProjectMetrics = {
    totalProjects: projects.length,
    activeProjects: projects.filter(
      (p) => p.status === 'in-progress' || p.status === 'pending-approval'
    ).length,
    delayedProjects: projects.filter((p) => p.status === 'draft').length,
    completedThisMonth: projects.filter(
      (p) => p.status === 'completed' && new Date(p.updatedAt) >= startOfMonth
    ).length,
  }

  return { projects, metrics }
}

export async function getProjectById(
  orgSlug: string,
  projectId: string
): Promise<Project | null> {
  const supabase = await createClient()

  // 1. Resolve organization ID from slug
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (orgError || !orgData) {
    console.error('Organization not found:', orgError)
    return null
  }

  // 2. Fetch single project record scoped to organization and project ID
  const { data: p, error } = await supabase
    .from('projects')
    .select(
      `
      id,
      org_id,
      name,
      client_id,
      description,
      status,
      start_date,
      start_from,
      due_date,
      created_at,
      updated_at,
      engagement,
      contract_value,
      retainer_hours,
      retainer_period,
      retainer_amount,
      retainer_overage,
      override_reason
    `
    )
    .eq('org_id', orgData.id)
    .eq('id', projectId)
    .single()

  if (error || !p) {
    console.error('Error fetching project by ID:', error)
    return null
  }

  // 3. Map database record to Project interface
  return {
    id: p.id,
    orgId: p.org_id,
    name: p.name,
    code: `PRJ-${p.id.substring(0, 4).toUpperCase()}`,
    clientId: p.client_id,
    clientName: p.client_id ? 'Assigned Client' : 'Internal Project',
    description: p.description ?? null,
    status: p.status,
    startDate: p.start_date ?? null,
    startFrom: p.start_from ?? null,
    dueDate: p.due_date ?? null,
    engagement: p.engagement,
    contractValue: p.contract_value ? Number(p.contract_value) : null,
    retainerHours: p.retainer_hours ? Number(p.retainer_hours) : null,
    retainerPeriod: p.retainer_period ?? null,
    retainerAmount: p.retainer_amount ? Number(p.retainer_amount) : null,
    retainerOverage: p.retainer_overage ? Number(p.retainer_overage) : null,
    overrideReason: p.override_reason ?? null,
    createdAt: p.created_at,
    updatedAt: p.updated_at || p.created_at,
    progressPercent: 0,
    members: [],
  }
}

export async function getProjectUpdates(
  projectId: string
): Promise<ProjectUpdate[]> {
  const supabase = await createClient()

  // 1. Fetch updates from the public schema
  const { data: updates, error } = await supabase
    .from('updates')
    .select('id, project_id, author_id, body, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error || !updates) {
    console.error('Error fetching project updates:', error)
    return []
  }

  const avatarColors = [
    'bg-emerald-600 text-white',
    'bg-purple-500 text-white',
    'bg-blue-500 text-white',
    'bg-amber-500 text-white',
  ]

  // 2. Map over updates and fetch author metadata separately
  // 1. Extract unique author IDs from the updates list
  const authorIds = Array.from(
    new Set(updates.map((item) => item.author_id).filter(Boolean))
  )

  // 2. Fetch all matching profiles in a single batch query
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', authorIds)

  // 3. Map profiles into a fast lookup dictionary
  const profileMap = new Map(
    profiles?.map((p) => [p.id, p.full_name || 'Team Member']) ?? []
  )

  // 4. Map updates with author details efficiently
  const updatesWithAuthors = updates.map((item, index) => {
    const name = profileMap.get(item.author_id) || 'Team Member'

    const initials = name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()

    return {
      id: item.id,
      projectId: item.project_id,
      authorId: item.author_id,
      authorName: name,
      authorInitials: initials || 'TM',
      avatarColorClass: avatarColors[index % avatarColors.length],
      body: item.body,
      createdAt: item.created_at,
    }
  })

  return updatesWithAuthors
}

export async function getProjectDeliverables(
  projectId: string
): Promise<DeliverableItem[]> {
  const supabase = await createClient()

  // 1. Fetch deliveries with linked delivery_assets
  const { data: deliveries, error } = await supabase
    .from('deliveries')
    .select(
      `
      id,
      project_id,
      org_id,
      milestone_id,
      title,
      description,
      status,
      approved_at,
      due_date,
      created_at,
      author_id,
      file_size,
      file_type,
      delivery_assets (
        id,
        file_path
      )
    `
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error || !deliveries) {
    console.error('Error fetching deliverables:', error)
    return []
  }

  const authorIds = Array.from(
    new Set(
      deliveries
        .map((d) => d.author_id)
        .filter((id): id is string => Boolean(id))
    )
  )

  // 3. Query profiles selecting existing columns only
  const { data: profiles } = authorIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', authorIds)
    : { data: [] }

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) || [])

  return deliveries.map((item) => {
    const profile = item.author_id ? profileMap.get(item.author_id) : null
    const name = profile?.full_name || 'Team Member'
    const extension =
      item.file_type || item.title.split('.').pop()?.toUpperCase() || 'FILE'

    return {
      id: item.id,
      projectId: item.project_id,
      orgId: item.org_id,
      milestoneId: item.milestone_id,
      title: item.title,
      description: item.description,
      status: item.status,
      approvedAt: item.approved_at,
      dueDate: item.due_date,
      createdAt: item.created_at,
      authorName: name,
      fileSize: item.file_size || '—',
      fileType: extension,
      assets: (item.delivery_assets || []).map((asset) => ({
        id: asset.id,
        filePath: asset.file_path,
      })),
    }
  })
}

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

export async function getClientByProjectId(
  projectId?: string | null
): Promise<ClientItem | null> {
  // Early return if there is no project ID provided
  if (!projectId) {
    return null
  }

  const supabase = await createClient()

  // Query projects table and join the related client
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

  // 1. Get authenticated user session
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 2. Fetch user profile from public.profiles table if user exists
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

      // Logged includes all time entries in the period
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

  // Calculate start of month and current date boundaries
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const today = now.toISOString().split('T')[0]

  // 1. Fetch time entries and related milestone
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

export async function getProjectsForInvoicing(
  orgId: string
): Promise<ProjectInvoiceContext[]> {
  const supabase = await createClient()

  // 1. Fetch active projects with client details
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select(
      `
      id,
      name,
      engagement,
      contract_value,
      retainer_hours,
      retainer_amount,
      client_id
    `
    )
    .eq('org_id', orgId)

  if (projectsError || !projects) {
    console.error('Error fetching projects:', projectsError)
    return []
  }

  // Fetch unique client IDs separately
  const clientIds = Array.from(
    new Set(projects.map((p) => p.client_id).filter(Boolean))
  ) as string[]

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', clientIds)

  const profileMap = new Map<string, string>()
  profiles?.forEach((p) => profileMap.set(p.id, p.full_name || 'Client'))

  // 2. Fetch approved time entries for hourly calculation
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('id, project_id, user_id, duration_minutes')
    .eq('status', 'approved')

  // Fetch allocations for rates
  const { data: allocations } = await supabase
    .from('project_allocations')
    .select('project_id, user_id, rate')

  return projects.map((project) => {
    const clientName = project.client_id
      ? profileMap.get(project.client_id) || 'Client'
      : 'Client'

    let lines: InvoiceLine[] = []
    let calloutMessage: string | null = null

    if (
      project.engagement === 'full_time' ||
      project.engagement === 'part_time'
    ) {
      // Calculate approved unbilled hours from time_entries
      const projEntries = (timeEntries || []).filter(
        (e) => e.project_id === project.id
      )

      if (projEntries.length > 0) {
        // Group by user to calculate rate
        const minutesByUser = new Map<string, number>()
        projEntries.forEach((e) => {
          minutesByUser.set(
            e.user_id,
            (minutesByUser.get(e.user_id) || 0) + (e.duration_minutes || 0)
          )
        })

        lines = Array.from(minutesByUser.entries()).map(
          ([userId, totalMins]) => {
            const hours = totalMins / 60
            // Find allocation rate or fallback
            const alloc = (allocations || []).find(
              (a) => a.project_id === project.id && a.user_id === userId
            )
            const hourlyRate = alloc?.rate ? Number(alloc.rate) : 120
            const totalAmount = Math.round(hours * hourlyRate)

            return {
              id: `line-${userId}`,
              description: `Marcus Lee — approved hours`, // Replace dynamically if needed
              typeLabel: 'HOURS',
              qty: `${hours}h`,
              rate: `$${hourlyRate}/hr`,
              amount: totalAmount,
            }
          }
        )
      }
    } else if (project.engagement === 'retainer') {
      const hoursBucket = project.retainer_hours || 80
      const retainerFee = Number(project.retainer_amount) || 6000

      calloutMessage = `Bucket 2h of ${hoursBucket}h used — retainer bills in full even if under-consumed.`
      lines = [
        {
          id: `retainer-${project.id}`,
          description: 'Monthly retainer',
          typeLabel: 'RETAINER',
          qty: `${hoursBucket}h bucket`,
          rate: '—',
          amount: retainerFee,
        },
      ]
    } else if (project.engagement === 'fixed') {
      const fixedFee = Number(project.contract_value) || 9600

      calloutMessage = 'Hours are tracked for context; the fee is fixed.'
      lines = [
        {
          id: `fixed-${project.id}`,
          description: 'Fixed project fee',
          typeLabel: 'FIXED',
          qty: '—',
          rate: '—',
          amount: fixedFee,
        },
      ]
    }

    return {
      id: project.id,
      name: project.name,
      clientName,
      engagement: project.engagement as EngagementModel,
      calloutMessage,
      lines,
    }
  })
}
