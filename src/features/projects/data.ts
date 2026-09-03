import { createClient } from '@/lib/supabase/server'
import type { Project, ProjectMetrics, ProjectUpdate } from './types'

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
  const updatesWithAuthors = await Promise.all(
    updates.map(async (item, index) => {
      let name = 'Team Member'

      try {
        const { data: userData } = await supabase.auth.admin.getUserById(
          item.author_id
        )
        const meta = userData?.user?.user_metadata || {}
        name = meta.full_name || meta.name || 'Team Member'
      } catch {
        // Fallback to default name if admin call fails or isn't permitted
      }

      const initials = name
        .split(' ')
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
  )

  return updatesWithAuthors
}
