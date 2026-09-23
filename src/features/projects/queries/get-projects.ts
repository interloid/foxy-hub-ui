import { calculateMilestoneProgress } from '@/lib/progress'
import { createClient } from '@/lib/supabase/server'
import { QueryData } from '@supabase/supabase-js'
import {
  ACTIVE_PROJECT_STATUSES,
  AT_RISK_PROJECT_STATUSES,
  CLOSED_PROJECT_STATUSES,
  ProjectTabCounts,
} from '../constants'
import {
  computeHoursBurnedPercent,
  computeProjectHealth,
  computeSchedulePercent,
} from '../lib/project-health'
import {
  ClientItem,
  GetProjectsParams,
  GetProjectsResult,
  Project,
  ProjectAllocationItem,
  ProjectHealthSummary,
  ProjectMetrics,
} from '../types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function getAllocatedProjectIds(
  supabase: SupabaseServerClient,
  orgId: string,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('project_allocations')
    .select('project_id, project:projects!inner(org_id)')
    .eq('user_id', userId)
    .eq('project.org_id', orgId)

  if (error || !data) {
    console.error('Error fetching allocated project ids:', error)
    return []
  }

  return Array.from(new Set(data.map((row) => row.project_id)))
}

async function getProjectHealthSummaries(
  supabase: SupabaseServerClient,
  projects: Project[]
): Promise<Map<string, ProjectHealthSummary>> {
  const summaries = new Map<string, ProjectHealthSummary>()
  if (projects.length === 0) return summaries

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]!

  const { data: entries, error } = await supabase
    .from('time_entries')
    .select('project_id, duration_minutes, work_date')
    .in(
      'project_id',
      projects.map((p) => p.id)
    )
    .neq('status', 'rejected')

  if (error) {
    console.error('Error fetching logged hours for project health:', error)
  }

  const totalMinutes = new Map<string, number>()
  const monthMinutes = new Map<string, number>()

  for (const entry of entries ?? []) {
    const minutes = entry.duration_minutes || 0
    totalMinutes.set(
      entry.project_id,
      (totalMinutes.get(entry.project_id) ?? 0) + minutes
    )

    if (entry.work_date >= monthStart) {
      monthMinutes.set(
        entry.project_id,
        (monthMinutes.get(entry.project_id) ?? 0) + minutes
      )
    }
  }

  for (const project of projects) {
    const isRetainer = project.engagement === 'retainer'
    const minutes = isRetainer
      ? (monthMinutes.get(project.id) ?? 0)
      : (totalMinutes.get(project.id) ?? 0)

    const loggedHours = Number((minutes / 60).toFixed(1))
    const budgetHours = isRetainer
      ? (project.retainerHours ?? null)
      : (project.estimatedHour ?? null)

    const hoursBurnedPercent = computeHoursBurnedPercent(
      loggedHours,
      budgetHours
    )

    const health = computeProjectHealth({
      hoursBurnedPercent,
      workDeliveredPercent: project.progressPercent,
      schedulePercent: computeSchedulePercent(
        project.startDate,
        project.dueDate,
        now
      ),
    })

    summaries.set(project.id, {
      status: health.status,
      label: health.label,
      loggedHours,
      budgetHours,
      hoursBurnedPercent,
    })
  }

  return summaries
}

export async function getProjectsData({
  orgSlug,
  page = 1,
  pageSize = 10,
  search = '',
  tab,
  status,
  engagement,
  clientId,
  teamMemberId,
  allocatedProject = false,
}: GetProjectsParams): Promise<GetProjectsResult> {
  const supabase = await createClient()

  // Default empty state
  const emptyResult: GetProjectsResult = {
    projects: [],
    metrics: {
      totalProjects: 0,
      activeProjects: 0,
      delayedProjects: 0,
      completedThisMonth: 0,
    },
    tabCounts: { allActive: 0, mine: 0, atRisk: 0, retainers: 0, closed: 0 },
    totalCount: 0,
    page,
    pageSize,
    totalPages: 0,
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 1. Fetch organization ID from slug
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (orgError || !orgData) {
    console.error('Organization not found:', orgError)
    return emptyResult
  }

  const orgId = orgData.id

  const mineProjectIds = user
    ? await getAllocatedProjectIds(supabase, orgId, user.id)
    : []

  const memberFilter =
    teamMemberId && teamMemberId !== 'all' ? teamMemberId : null

  let allocationFilterIds: string[] | null = null
  if (tab === 'mine' || allocatedProject) {
    allocationFilterIds = mineProjectIds
  } else if (memberFilter) {
    allocationFilterIds = await getAllocatedProjectIds(
      supabase,
      orgId,
      memberFilter
    )
  }

  // Calculate range offset for pagination
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // 2. Fetch paginated projects along with total count
  let projectsQuery = supabase
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
      estimated_hours,
      override_reason,
      client_org_id,
      client:clients (
        id,
        name
      ),
      milestones (
        status
      )
    `,
      { count: 'exact' }
    )
    .eq('org_id', orgId)

  if (search.trim()) {
    projectsQuery = projectsQuery.ilike('name', `%${search.trim()}%`)
  }

  if (clientId && clientId !== 'all') {
    projectsQuery = projectsQuery.eq('client_org_id', clientId)
  }

  if (engagement) {
    projectsQuery = projectsQuery.eq('engagement', engagement)
  } else if (tab === 'retainers') {
    projectsQuery = projectsQuery.eq('engagement', 'retainer')
  }

  if (status) {
    projectsQuery = projectsQuery.eq('status', status)
  } else if (tab === 'all-active') {
    projectsQuery = projectsQuery.in('status', ACTIVE_PROJECT_STATUSES)
  } else if (tab === 'at-risk') {
    projectsQuery = projectsQuery.in('status', AT_RISK_PROJECT_STATUSES)
  } else if (tab === 'closed') {
    projectsQuery = projectsQuery.in('status', CLOSED_PROJECT_STATUSES)
  }

  if (allocationFilterIds !== null) {
    projectsQuery = projectsQuery.in('id', allocationFilterIds)
  }

  projectsQuery = projectsQuery
    .order('updated_at', { ascending: false })
    .range(from, to)

  type RawProjectsResponse = QueryData<typeof projectsQuery>

  const skipMainQuery = allocationFilterIds?.length === 0

  const {
    data: rawProjects,
    count,
    error,
  } = skipMainQuery
    ? { data: [] as RawProjectsResponse, count: 0, error: null }
    : await projectsQuery

  if (error || !rawProjects) {
    console.error('Error fetching projects:', error)
    return emptyResult
  }

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  // 3. Map projects and calculate progressPercent using milestone logic
  const projects: Project[] = (rawProjects as RawProjectsResponse).map((p) => {
    const milestones = p.milestones ?? []
    const { percentage } = calculateMilestoneProgress(milestones)

    return {
      id: p.id,
      orgId: p.org_id,
      name: p.name,
      code: `PRJ-${p.id.substring(0, 4).toUpperCase()}`,
      clientId: p.client_id,
      clientOrgId: p.client_org_id ?? null,
      clientName: p.client?.name ?? 'Internal Project',
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
      progressPercent: percentage,
      estimatedHour: p.estimated_hours ? Number(p.estimated_hours) : null,
    }
  })

  const healthSummaries = await getProjectHealthSummaries(supabase, projects)
  for (const project of projects) {
    project.health = healthSummaries.get(project.id)
  }

  // 4. Calculate organization-wide metrics and tab counts
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const { data: allStatuses } = await supabase
    .from('projects')
    .select('status, engagement, updated_at')
    .eq('org_id', orgId)

  const statusList = allStatuses ?? []

  const metrics: ProjectMetrics = {
    totalProjects: statusList.length,
    activeProjects: statusList.filter(
      (p) => p.status === 'in-progress' || p.status === 'pending-approval'
    ).length,
    delayedProjects: statusList.filter((p) => p.status === 'on-hold').length,
    completedThisMonth: statusList.filter(
      (p) =>
        p.status === 'completed' &&
        p.updated_at &&
        new Date(p.updated_at) >= startOfMonth
    ).length,
  }

  const tabCounts: ProjectTabCounts = {
    allActive: statusList.filter((p) =>
      ACTIVE_PROJECT_STATUSES.includes(p.status)
    ).length,
    mine: mineProjectIds.length,
    atRisk: statusList.filter((p) =>
      AT_RISK_PROJECT_STATUSES.includes(p.status)
    ).length,
    retainers: statusList.filter((p) => p.engagement === 'retainer').length,
    closed: statusList.filter((p) => CLOSED_PROJECT_STATUSES.includes(p.status))
      .length,
  }

  return {
    projects,
    metrics,
    tabCounts,
    totalCount,
    page,
    pageSize,
    totalPages,
  }
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
      estimated_hours,
      override_reason,
      client_org_id,
      client:clients (
        id,
        name
      )
    `
    )
    .eq('org_id', orgData.id)
    .eq('id', projectId)
    .single()
  if (error || !p) {
    console.error('Error fetching project by ID:', error)
    return null
  }
  const { data, error: milestoneError } = await supabase
    .from('milestones')
    .select('status', { count: 'exact' })
    .eq('project_id', projectId)

  if (milestoneError) {
    console.error('Error fetching milestone counts:', error)
  }

  const total = data?.length || 0
  const completed = data?.filter((m) => m.status === 'completed').length || 0

  // 3. Map database record to Project interface
  return {
    id: p.id,
    orgId: p.org_id,
    name: p.name,
    clientId: p.client_id,
    clientOrgId: p.client_org_id ?? null,
    clientName: p.client?.name ?? 'Internal Project',
    description: p.description ?? null,
    status: p.status,
    startDate: p.start_date ?? null,
    startFrom: p.start_from ?? null,
    dueDate: p.due_date ?? null,
    engagement: p.engagement,
    milestones: { completed, total },
    contractValue: p.contract_value ? Number(p.contract_value) : null,
    retainerHours: p.retainer_hours ? Number(p.retainer_hours) : null,
    retainerPeriod: p.retainer_period ?? null,
    retainerAmount: p.retainer_amount ? Number(p.retainer_amount) : null,
    retainerOverage: p.retainer_overage ? Number(p.retainer_overage) : null,
    overrideReason: p.override_reason ?? null,
    createdAt: p.created_at,
    updatedAt: p.updated_at || p.created_at,
    progressPercent: 0,
    estimatedHour: p.estimated_hours,
  }
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
