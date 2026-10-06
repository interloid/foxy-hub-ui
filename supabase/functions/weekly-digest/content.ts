/**
 * What goes in one person's digest for one workspace.
 *
 * Runs with the SERVICE-ROLE key, so RLS does not apply: every query below is scoped by
 * hand to this org (and, where it is personal, this user). Clients never get a digest —
 * the caller only passes staff memberships.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

import type { DigestWeek } from './time.ts'

export type StaffRole = 'primary_admin' | 'admin' | 'manager' | 'contributor'

const APPROVER_ROLES: StaffRole[] = ['primary_admin', 'admin', 'manager']
const ADMIN_ROLES: StaffRole[] = ['primary_admin', 'admin']
const OPEN_PROJECT_STATUSES = ['draft', 'pending', 'in-progress', 'pending-approval']

export type DigestOrg = {
  id: string
  name: string
  slug: string
  currency: string
  daily_capacity_hours: number
  days_per_week: number
}

export type DigestContent = {
  /** Logged last week vs the workspace's standard week. */
  hours: { loggedMinutes: number; capacityMinutes: number }
  /** Own entries still needing action. */
  openEntries: { draft: number; rejected: number }
  /** Milestones due this week on the projects this person works on. */
  milestones: { title: string; projectId: string; projectName: string; dueDate: string }[]
  /** Approvers only (primary admin, admin, manager). */
  approvals: { count: number; minutes: number } | null
  /** Managers and admins: deliveries sent to clients, not yet approved. */
  deliveriesAwaitingClient: number | null
  /** Managers and admins: open projects whose logged hours passed the estimate. */
  overBudget: { projectId: string; name: string; loggedHours: number; estimatedHours: number }[] | null
  /** Admins only. */
  invoices: { overdueCount: number; overdueAmount: number; dueThisWeekCount: number } | null
}

export function isEmpty(content: DigestContent): boolean {
  return (
    content.hours.loggedMinutes === 0 &&
    content.openEntries.draft === 0 &&
    content.openEntries.rejected === 0 &&
    content.milestones.length === 0 &&
    !content.approvals?.count &&
    !content.deliveriesAwaitingClient &&
    !content.overBudget?.length &&
    !content.invoices?.overdueCount &&
    !content.invoices?.dueThisWeekCount
  )
}

function sum(rows: { duration_minutes: number | null }[] | null): number {
  return (rows ?? []).reduce((total, row) => total + (row.duration_minutes ?? 0), 0)
}

export async function buildDigestContent(
  supabase: SupabaseClient,
  params: { userId: string; role: StaffRole; org: DigestOrg; week: DigestWeek }
): Promise<DigestContent> {
  const { userId, role, org, week } = params
  const isApprover = APPROVER_ROLES.includes(role)
  const isAdmin = ADMIN_ROLES.includes(role)

  // The workspace's open projects, and which of them this person is allocated to.
  const [{ data: projects }, { data: allocations }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, estimated_hours')
      .eq('org_id', org.id)
      .in('status', OPEN_PROJECT_STATUSES),
    supabase
      .from('project_allocations')
      .select('project_id, projects!inner(org_id)')
      .eq('user_id', userId)
      .eq('projects.org_id', org.id),
  ])

  const openProjects = projects ?? []
  const projectName = new Map(openProjects.map((p) => [p.id, p.name as string]))
  const allocated = new Set((allocations ?? []).map((a) => a.project_id as string))
  // Managers and admins follow the whole workspace; contributors their own projects.
  const followedIds = openProjects
    .map((p) => p.id as string)
    .filter((id) => isApprover || allocated.has(id))

  const [loggedRes, openRes, milestonesRes] = await Promise.all([
    supabase
      .from('time_entries')
      .select('duration_minutes, projects!inner(org_id)')
      .eq('user_id', userId)
      .eq('projects.org_id', org.id)
      .neq('status', 'rejected')
      .gte('work_date', week.lastWeekStart)
      .lte('work_date', week.lastWeekEnd),
    supabase
      .from('time_entries')
      .select('status, projects!inner(org_id)')
      .eq('user_id', userId)
      .eq('projects.org_id', org.id)
      .in('status', ['draft', 'rejected']),
    followedIds.length
      ? supabase
          .from('milestones')
          .select('title, due_date, project_id')
          .in('project_id', followedIds)
          .neq('status', 'completed')
          .gte('due_date', week.weekStart)
          .lte('due_date', week.thisWeekEnd)
          .order('due_date')
          .limit(8)
      : Promise.resolve({ data: [] as { title: string; due_date: string; project_id: string }[] }),
  ])

  const openRows = openRes.data ?? []
  const content: DigestContent = {
    hours: {
      loggedMinutes: sum(loggedRes.data),
      capacityMinutes: org.daily_capacity_hours * org.days_per_week * 60,
    },
    openEntries: {
      draft: openRows.filter((r) => r.status === 'draft').length,
      rejected: openRows.filter((r) => r.status === 'rejected').length,
    },
    milestones: (milestonesRes.data ?? []).map((m) => ({
      title: m.title,
      projectId: m.project_id,
      projectName: projectName.get(m.project_id) ?? 'Project',
      dueDate: m.due_date,
    })),
    approvals: null,
    deliveriesAwaitingClient: null,
    overBudget: null,
    invoices: null,
  }

  if (isApprover) {
    const estimated = openProjects.filter((p) => Number(p.estimated_hours) > 0)

    const [approvalsRes, deliveriesRes, burnRes] = await Promise.all([
      supabase
        .from('time_entries')
        .select('duration_minutes, projects!inner(org_id)')
        .eq('projects.org_id', org.id)
        .eq('status', 'submitted'),
      supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('status', 'submitted'),
      estimated.length
        ? supabase
            .from('time_entries')
            .select('project_id, duration_minutes')
            .in('project_id', estimated.map((p) => p.id))
            .neq('status', 'rejected')
        : Promise.resolve({ data: [] as { project_id: string; duration_minutes: number }[] }),
    ])

    content.approvals = {
      count: approvalsRes.data?.length ?? 0,
      minutes: sum(approvalsRes.data),
    }
    content.deliveriesAwaitingClient = deliveriesRes.count ?? 0

    const loggedByProject = new Map<string, number>()
    for (const row of burnRes.data ?? []) {
      loggedByProject.set(
        row.project_id,
        (loggedByProject.get(row.project_id) ?? 0) + (row.duration_minutes ?? 0)
      )
    }
    content.overBudget = estimated
      .map((p) => ({
        projectId: p.id as string,
        name: p.name as string,
        loggedHours: Math.round(((loggedByProject.get(p.id) ?? 0) / 60) * 10) / 10,
        estimatedHours: Number(p.estimated_hours),
      }))
      .filter((p) => p.loggedHours > p.estimatedHours)
      .slice(0, 5)
  }

  if (isAdmin) {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('amount, status, due_date')
      .eq('org_id', org.id)
      .in('status', ['due', 'overdue'])

    const now = Date.now()
    const weekEndMs = Date.parse(`${week.thisWeekEnd}T23:59:59Z`)
    let overdueCount = 0
    let overdueAmount = 0
    let dueThisWeekCount = 0
    for (const invoice of invoices ?? []) {
      const due = invoice.due_date ? Date.parse(invoice.due_date) : NaN
      const overdue =
        invoice.status === 'overdue' || (Number.isFinite(due) && due < now)
      if (overdue) {
        overdueCount += 1
        overdueAmount += Number(invoice.amount) || 0
      } else if (Number.isFinite(due) && due <= weekEndMs) {
        dueThisWeekCount += 1
      }
    }
    content.invoices = { overdueCount, overdueAmount, dueThisWeekCount }
  }

  return content
}
