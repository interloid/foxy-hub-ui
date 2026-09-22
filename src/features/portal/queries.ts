import 'server-only'

import type {
  ActiveProject,
  ActivityEvent,
  PendingApproval,
} from '@/features/dashboard/types'
import { initialsOf } from '@/lib/initials'
import { formatCurrency } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

export interface PortalInvoice {
  id: string
  number: string
  amount: number
  currency: string
  status: 'draft' | 'due' | 'paid' | 'overdue' | 'cancelled'
  issuedAt: string
  dueDate: string | null
  paidAt: string | null
  invoiceUrl: string | null
}

/**
 * The invoices raised against one project.
 *
 * No org or client filter: `staff_and_own_client_view_invoices` only returns rows whose
 * project has `client_id = auth.uid()` to anyone who is not staff, so a client passing
 * somebody else's project id gets an empty list rather than their bills.
 *
 * Drafts are dropped deliberately. A draft is the agency still deciding what to charge —
 * it has an amount and a number, so it would read to a client as a bill they owe.
 */
export async function getPortalProjectInvoices(
  projectId: string
): Promise<PortalInvoice[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, amount, currency, status, created_at, due_date, paid_at, invoice_url'
    )
    .eq('project_id', projectId)
    .neq('status', 'draft')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getPortalProjectInvoices failed:', error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    number: row.invoice_number,
    amount: Number(row.amount) || 0,
    currency: row.currency,
    status: row.status as PortalInvoice['status'],
    issuedAt: row.created_at,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    invoiceUrl: row.invoice_url,
  }))
}

export interface PortalMetrics {
  activeProjects: number
  projectsAddedThisMonth: number
  pendingApprovals: number
  approvalsDueThisWeek: number
  outstandingAmount: number
  overdueInvoices: number
  unpaidInvoices: number
  currency: string
}

/** Mirrors `OPEN_PROJECT_STATUSES` in the staff dashboard, so both count the same thing. */
const OPEN_PROJECT_STATUSES = [
  'draft',
  'pending',
  'in-progress',
  'pending-approval',
] as const

/**
 * The client's own numbers.
 *
 * Every query below is scoped by `org_id` alone, and RLS does the rest: `projects`,
 * `deliveries` and `invoices` all resolve through `projects.client_id = auth.uid()` for a
 * non-staff caller, so these counts cover this client's work and nobody else's.
 */
export async function getPortalMetrics(
  orgId: string,
  currency: string
): Promise<PortalMetrics> {
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).toISOString()
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const [openProjects, addedThisMonth, pending, dueThisWeek, unpaid] =
    await Promise.all([
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .in('status', OPEN_PROJECT_STATUSES),

      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', startOfMonth),

      // `submitted` is a deliverable the agency has handed over and is waiting on — from
      // this side of the portal that is work awaiting THIS client's approval.
      supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'submitted'),

      supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'submitted')
        .gte('due_date', today)
        .lte('due_date', nextWeek),

      supabase
        .from('invoices')
        .select('amount, status')
        .eq('org_id', orgId)
        .in('status', ['due', 'overdue']),
    ])

  const invoices = unpaid.data ?? []

  return {
    activeProjects: openProjects.count ?? 0,
    projectsAddedThisMonth: addedThisMonth.count ?? 0,
    pendingApprovals: pending.count ?? 0,
    approvalsDueThisWeek: dueThisWeek.count ?? 0,
    outstandingAmount: invoices.reduce(
      (total, row) => total + (Number(row.amount) || 0),
      0
    ),
    overdueInvoices: invoices.filter((row) => row.status === 'overdue').length,
    unpaidInvoices: invoices.length,
    currency,
  }
}

/** Matches the staff dashboard's map, so a project reads the same on both sides. */
const STATUS_PROGRESS_MAP: Record<string, string> = {
  draft: '0',
  pending: '0',
  'pending-approval': '90',
  'in-progress': '50',
  'on-hold': '40',
  completed: '100',
  cancelled: '0',
}

function relativeTime(value: string): string {
  const created = new Date(value)
  const diffHours = Math.floor((Date.now() - created.getTime()) / 3_600_000)

  if (diffHours < 24) return `${Math.max(diffHours, 0)}h ago`
  if (diffHours < 48) return 'Yesterday'

  return created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export interface PortalDashboard {
  approvals: PendingApproval[]
  projects: ActiveProject[]
  activities: ActivityEvent[]
}

/**
 * The three widget feeds, scoped to one client by RLS alone.
 *
 * The activity feed is built from `updates` and `deliveries` rather than read from
 * `activity_events`: its policy is `has_org_role(['primary_admin','admin','manager','contributor'])`, so
 * a client gets nothing from it. These two tables carry the events a client actually cares
 * about — what was said, and what was handed over — and both resolve through
 * `projects.client_id = auth.uid()`.
 */
export async function getPortalDashboard(
  orgId: string,
  currency: string
): Promise<PortalDashboard> {
  const supabase = await createClient()

  const [deliveriesRes, projectsRes, updatesRes] = await Promise.all([
    supabase
      .from('deliveries')
      .select(
        'id, title, status, project_id, due_date, created_at, projects!inner(name, clients(name))'
      )
      .eq('org_id', orgId)
      // Only `submitted`. A `pending` deliverable is the agency still working on it, so
      // listing it here would ask the client to approve something not yet handed over.
      .eq('status', 'submitted')
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('projects')
      .select(
        'id, name, status, contract_value, retainer_amount, clients(name)'
      )
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('updates')
      .select('id, body, created_at, author_id, projects!inner(name)')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const approvals: PendingApproval[] = (deliveriesRes.data ?? []).map((d) => {
    const project = Array.isArray(d.projects) ? d.projects[0] : d.projects
    const rawClient = project?.clients
    const clientName =
      (Array.isArray(rawClient) ? rawClient[0]?.name : rawClient?.name) ||
      'Internal'

    return {
      id: d.id,
      name: d.title,
      project: project?.name || 'General',
      projectId: d.project_id,
      client: clientName,
      dueDate: d.due_date,
    }
  })

  const projects: ActiveProject[] = (projectsRes.data ?? []).map((p) => {
    const rawClient = p.clients
    const clientName =
      (Array.isArray(rawClient) ? rawClient[0]?.name : rawClient?.name) ||
      'Internal'
    const value = p.contract_value || p.retainer_amount || 0

    return {
      id: p.id,
      name: p.name,
      client: clientName,
      status: p.status,
      progress: STATUS_PROGRESS_MAP[p.status] ?? '0',
      value: value > 0 ? formatCurrency(value, currency) : '—',
    }
  })

  // Author names, so an update reads as somebody saying something rather than a system
  // event. `profiles` is readable here: its policy covers anyone sharing an org.
  const authorIds = Array.from(
    new Set((updatesRes.data ?? []).map((u) => u.author_id).filter(Boolean))
  )

  const { data: authors } = authorIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', authorIds)
    : { data: [] }

  const authorNames = new Map(
    (authors ?? []).map((a) => [a.id, a.full_name as string | null])
  )

  const updateEvents: (ActivityEvent & { at: string })[] = (
    updatesRes.data ?? []
  ).map((u) => {
    const project = Array.isArray(u.projects) ? u.projects[0] : u.projects
    const author = authorNames.get(u.author_id) || 'Someone'

    return {
      id: `update-${u.id}`,
      initials: initialsOf(author, null),
      text: `${author} posted an update on ${project?.name ?? 'a project'}`,
      time: relativeTime(u.created_at),
      at: u.created_at,
    }
  })

  const deliveryEvents: (ActivityEvent & { at: string })[] = (
    deliveriesRes.data ?? []
  ).map((d) => {
    const project = Array.isArray(d.projects) ? d.projects[0] : d.projects

    return {
      id: `delivery-${d.id}`,
      initials: initialsOf(d.title, null),
      text: `${d.title} was sent for your approval on ${project?.name ?? 'a project'}`,
      time: relativeTime(d.created_at),
      at: d.created_at,
    }
  })

  // `at` is only here to merge two feeds into one order; the widget never sees it.
  const activities: ActivityEvent[] = [...updateEvents, ...deliveryEvents]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6)
    .map((event) => ({
      id: event.id,
      initials: event.initials,
      text: event.text,
      time: event.time,
    }))

  return { approvals, projects, activities }
}

export interface PortalTeamMember {
  id: string
  name: string
  initials: string
  role: string
}

/**
 * Who to talk to at the agency.
 *
 * Not the people allocated to the project: `project_allocations` is staff-only, and so is
 * the `clients` table that `ClientCard` reads — a client gets nothing from either. What a
 * client CAN read is `memberships` (they share the org) joined to `profiles`, so this is
 * the agency's owner and admins, which is who a client would want anyway.
 */
export async function getPortalProjectTeam(
  orgId: string
): Promise<PortalTeamMember[]> {
  const supabase = await createClient()

  const { data: memberships } = await supabase
    .from('memberships')
    .select('user_id, role')
    .eq('org_id', orgId)
    .in('role', ['primary_admin', 'admin', 'manager'])
    .eq('status', true)
    .order('created_at', { ascending: true })
    .limit(3)

  const userIds = (memberships ?? []).map((m) => m.user_id)
  if (userIds.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)

  const names = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name as string | null])
  )

  return (memberships ?? []).map((m) => {
    const name = names.get(m.user_id) || 'Your account contact'

    return {
      id: m.user_id,
      name,
      initials: initialsOf(name, null),
      role: m.role === 'primary_admin' ? 'Account lead' : 'Account contact',
    }
  })
}

/**
 * One invoice by id, for the page a payer lands on after Stripe.
 *
 * RLS scopes it exactly as the list does, so a client following a guessed id sees nothing
 * rather than someone else's bill. Drafts are not excluded here — unlike the list, this
 * answers "what happened to the thing I just paid", and hiding the row would read as a
 * failure rather than as a document that was never issued.
 */
export async function getPortalInvoice(
  invoiceId: string
): Promise<PortalInvoice | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, amount, currency, status, created_at, due_date, paid_at, invoice_url'
    )
    .eq('id', invoiceId)
    .maybeSingle()

  if (error || !data) return null

  return {
    id: data.id,
    number: data.invoice_number,
    amount: Number(data.amount) || 0,
    currency: data.currency,
    status: data.status as PortalInvoice['status'],
    issuedAt: data.created_at,
    dueDate: data.due_date,
    paidAt: data.paid_at,
    invoiceUrl: data.invoice_url,
  }
}
