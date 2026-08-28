import { cache } from 'react'
import { addDaysISO, startOfMonthISO, todayISO } from './date'
import { initialsOf } from './initials'
import { createClient } from './supabase/server'

export type SessionUser = {
  id: string
  email: string | null
}

export type AccountDTO = {
  id: string
  email: string | null
  fullName: string | null
  role: string | null
  initials: string
  isAdmin: boolean
  orgName: string | undefined
  isMember: boolean
}

export type WorkspaceDTO = {
  id: string
  name: string
  slug: string
  role: string
}

export type DashboardMetricsDTO = {
  openProjects: number
  projectsAddedThisMonth: number
  pendingApprovals: number
  approvalsDueThisWeek: number
  minutesToApprove: number
  timesheetsToApprove: number
  outstandingAmount: number
  overdueInvoices: number
  unpaidInvoices: number
  mrrCents: number
  activeSeats: number
  currency: string
}

const ADMIN_ROLES: readonly string[] = ['owner', 'admin']

export function isAdminRole(role: string | null | undefined): boolean {
  return role != null && ADMIN_ROLES.includes(role.toLowerCase())
}

const OPEN_PROJECT_STATUSES = [
  'draft',
  'pending',
  'in-progress',
  'pending-approval',
] as const

export const verifySession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  return { id: user.id, email: user.email ?? null }
})

export const getWorkspace = cache(
  async (slug?: string): Promise<WorkspaceDTO | null> => {
    const session = await verifySession()
    if (!session) return null

    const supabase = await createClient()
    let query = supabase
      .from('memberships')
      .select('role, organizations!inner(id, name, slug)')
      .eq('user_id', session.id)

    if (slug) {
      query = query.eq('organizations.slug', slug)
    }

    const { data, error } = await query.limit(1).maybeSingle()
    if (error || !data?.organizations) return null

    const org = data.organizations
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      role: data.role as string,
    }
  }
)

export const getAccount = cache(
  async (orgSlug?: string): Promise<AccountDTO | null> => {
    const session = await verifySession()
    if (!session) return null

    const supabase = await createClient()
    const workspace = await getWorkspace(orgSlug)

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', session.id)
      .maybeSingle()

    const role = workspace?.role ?? null

    return {
      id: session.id,
      email: session.email,
      fullName: (profile?.full_name as string | null) ?? null,
      role,
      initials: initialsOf(
        (workspace?.slug as string | null) ?? null,
        session.email
      ),
      isAdmin: isAdminRole(role),
      orgName: workspace?.name,
      isMember: Boolean(workspace),
    }
  }
)

export const getDashboardMetrics = cache(
  async (orgSlug?: string): Promise<DashboardMetricsDTO | null> => {
    const workspace = await getWorkspace(orgSlug)
    if (!workspace) return null

    const supabase = await createClient()
    const org = workspace.id
    const today = todayISO()

    const [
      openProjects,
      addedThisMonth,
      pendingApprovals,
      dueThisWeek,
      submittedEntries,
      unpaidInvoices,
      overdueInvoices,
      subscription,
      seats,
      orgRow,
    ] = await Promise.all([
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org)
        .in('status', OPEN_PROJECT_STATUSES),
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org)
        .gte('created_at', startOfMonthISO()),
      supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org)
        .eq('status', 'submitted'),
      supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org)
        .eq('status', 'submitted')
        .gte('due_date', today)
        .lte('due_date', addDaysISO(7)),
      supabase
        .from('time_entries')
        .select('duration_minutes, projects!inner(org_id)')
        .eq('status', 'submitted')
        .eq('projects.org_id', org),
      supabase
        .from('invoices')
        .select('amount')
        .eq('org_id', org)
        .in('status', ['due', 'overdue']),
      supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org)
        .eq('status', 'overdue'),
      supabase
        .from('subscriptions')
        .select('plans(price_cents, duration_months)')
        .eq('org_id', org)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org)
        .in('role', ['owner', 'admin', 'member']),
      supabase
        .from('organizations')
        .select('currency')
        .eq('id', org)
        .maybeSingle(),
    ])

    const minutes = (
      (submittedEntries.data ?? []) as { duration_minutes: number }[]
    ).reduce((total, row) => total + (row.duration_minutes ?? 0), 0)

    const outstanding = (
      (unpaidInvoices.data ?? []) as { amount: number | string }[]
    ).reduce((total, row) => total + (Number(row.amount) || 0), 0)

    const plan = subscription.data?.plans
    const mrrCents = plan?.duration_months
      ? Math.round(plan.price_cents / plan.duration_months)
      : 0

    return {
      openProjects: openProjects.count ?? 0,
      projectsAddedThisMonth: addedThisMonth.count ?? 0,
      pendingApprovals: pendingApprovals.count ?? 0,
      approvalsDueThisWeek: dueThisWeek.count ?? 0,
      minutesToApprove: minutes,
      timesheetsToApprove: (submittedEntries.data ?? []).length,
      outstandingAmount: outstanding,
      overdueInvoices: overdueInvoices.count ?? 0,
      unpaidInvoices: (unpaidInvoices.data ?? []).length,
      mrrCents,
      activeSeats: seats.count ?? 0,
      currency: (orgRow.data?.currency as string | undefined) ?? 'USD',
    }
  }
)

export const getUnpaidInvoiceCount = cache(
  async (orgSlug?: string): Promise<number> => {
    const workspace = await getWorkspace(orgSlug)
    if (!workspace) return 0

    const supabase = await createClient()
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', workspace.id)
      .in('status', ['due', 'overdue'])

    return count ?? 0
  }
)
