import { calculateMilestoneProgress } from '@/lib/progress'
import { createClient } from '@/lib/supabase/server'
import { QueryData } from '@supabase/supabase-js'
import {
  GetProjectsParams,
  GetProjectsResult,
  Project,
  ProjectMetrics,
} from '../types'

export async function getProjectsData({
  orgSlug,
  page = 1,
  pageSize = 10,
  search = '',
}: GetProjectsParams): Promise<GetProjectsResult> {
  const supabase = await createClient()

  // Default empty state
  const emptyResult = {
    projects: [],
    metrics: {
      totalProjects: 0,
      activeProjects: 0,
      delayedProjects: 0,
      completedThisMonth: 0,
    },
    totalCount: 0,
    page,
    pageSize,
    totalPages: 0,
  }

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
    .eq('org_id', orgData.id)

  if (search.trim()) {
    projectsQuery = projectsQuery.ilike('name', `%${search.trim()}%`)
  }

  // Apply ordering and range bounds
  projectsQuery = projectsQuery
    .order('updated_at', { ascending: false })
    .range(from, to)

  type RawProjectsResponse = QueryData<typeof projectsQuery>

  const { data: rawProjects, count, error } = await projectsQuery

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
    }
  })

  // 4. Calculate organization-wide metrics
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const { data: allStatuses } = await supabase
    .from('projects')
    .select('status, updated_at')
    .eq('org_id', orgData.id)

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

  return {
    projects,
    metrics,
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
  }
}
