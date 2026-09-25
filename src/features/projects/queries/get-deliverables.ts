'use server'
import { createClient } from '@/lib/supabase/server'
import {
  DeliverableItem,
  GetProjectDeliveriesResult,
  ProjectDelivery,
} from '../types'

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

export async function getProjectDeliveries(
  projectId: string,
  page = 1,
  pageSize = 5,
  statuses?: ProjectDelivery['status'][]
): Promise<GetProjectDeliveriesResult> {
  const supabase = await createClient()

  const emptyResult: GetProjectDeliveriesResult = {
    deliveries: [],
    totalCount: 0,
    page,
    pageSize,
    totalPages: 0,
  }

  // Calculate range offset for pagination
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('deliveries')
    .select(
      `
      id,
      title,
      description,
      status,
      due_date,
      created_at,
      approved_at,
      org_id,
      project_id,
      milestone:milestones(title),
      assets:delivery_assets(id, file_path)
    `,
      { count: 'exact' }
    )
    .eq('project_id', projectId)

  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error || !data) {
    console.error('Error fetching project deliverables:', error)
    return emptyResult
  }

  const totalCount = count ?? 0
  const deliveries: ProjectDelivery[] = data.map((item) => {
    const milestoneObj = Array.isArray(item.milestone)
      ? item.milestone[0]
      : item.milestone

    return {
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      dueDate: item.due_date,
      createdAt: item.created_at,
      orgId: item.org_id,
      projectId: item.project_id,
      approvedAt: item.approved_at,
      milestoneTitle: milestoneObj?.title || null,
      assets: (item.assets || []).map((asset) => ({
        id: asset.id,
        filePath: asset.file_path,
      })),
    }
  })

  return {
    deliveries,
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  }
}

export async function getDeliveryById(
  deliveryId: string,
  projectId: string
): Promise<ProjectDelivery | { ok: boolean; message?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('deliveries')
    .select(
      `
      id,
      title,
      description,
      status,
      due_date,
      created_at,
      approved_at,
      org_id,
      project_id,
      milestone:milestones(title),
      assets:delivery_assets(id, file_path)
    `,
      { count: 'exact' }
    )
    .eq('project_id', projectId)
    .eq('id', deliveryId)
    .single()

  if (error || !data) {
    console.error('Error fetching project deliverables:', error)
    return { ok: false, message: error.message }
  }

  const milestoneObj = Array.isArray(data.milestone)
    ? data.milestone[0]
    : data.milestone
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    status: data.status,
    dueDate: data.due_date,
    createdAt: data.created_at,
    orgId: data.org_id,
    projectId: data.project_id,
    approvedAt: data.approved_at,
    milestoneTitle: milestoneObj?.title || null,
    assets: (data.assets || []).map((asset) => ({
      id: asset.id,
      filePath: asset.file_path,
    })),
  }
}
