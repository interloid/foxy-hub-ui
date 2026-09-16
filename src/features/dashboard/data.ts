import { getDashboardMetrics } from '@/lib/dal'
import { initialsOf } from '@/lib/initials'
import { createClient } from '@/lib/supabase/server'
import { getStartOfWeekISO } from '@/lib/week'
import { notFound } from 'next/navigation'
import {
  ActiveProject,
  ActivityEvent,
  CapacityRow,
  DashboardData,
  PendingApproval,
  UserRole,
} from './types'

export async function getDashboardData(
  orgSlug: string
): Promise<DashboardData> {
  const supabase = await createClient()

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const STATUS_PROGRESS_MAP: Record<string, string> = {
    draft: '0',
    pending: '0',
    'pending-approval': '90',
    'in-progress': '50',
    'on-hold': '40',
    completed: '100',
    cancelled: '0',
  }

  const [{ data: membership, error: membershipError }, { data: profile }] =
    await Promise.all([
      supabase
        .from('memberships')
        .select(
          `
          role,
          organization:organizations!inner (
            id,
            name,
            slug,
            daily_capacity_hours,
            days_per_week
          )
        `
        )
        .eq('user_id', user.id)
        .eq('organization.slug', orgSlug)
        .maybeSingle(),

      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle(),
    ])

  // Strict Guard: Reject if organization does not exist or user is NOT a member
  if (membershipError || !membership || !membership.organization) {
    notFound()
  }

  const org = membership.organization
  const role: UserRole = (membership.role as UserRole) ?? 'member'

  const metrics = await getDashboardMetrics(orgSlug)
  if (!metrics) {
    notFound()
  }

  const rawName =
    profile?.full_name || user.user_metadata?.full_name || user.email || 'User'
  const userName = rawName.split(' ')[0]

  // 3. Fetch org-scoped resources & subscription info
  const [
    { data: rawProjects },
    { data: rawDeliveries },
    { data: rawActivities },
    { data: members },
    { data: subscription },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'id, name, status, contract_value, retainer_amount, clients(name)'
      )
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('deliveries')
      .select('id, title, status, projects!inner(name, clients(name))')
      .eq('org_id', org.id)
      .in('status', ['pending', 'submitted'])
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('activity_events')
      .select('id, summary, created_at')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('memberships')
      .select('user_id, role')
      .eq('org_id', org.id)
      .neq('role', 'client'),

    supabase
      .from('subscriptions')
      .select(
        `
        status,
        current_period_end,
        plan:plans (
          name,
          seats
        )
      `
      )
      .eq('org_id', org.id)
      .maybeSingle(),
  ])

  // Format Active Projects
  const projects: ActiveProject[] = (rawProjects || []).map((p) => {
    const rawClient = p.clients
    const clientName = Array.isArray(rawClient)
      ? rawClient[0]?.name
      : rawClient?.name || 'Internal'

    const val = p.contract_value || p.retainer_amount || 0

    return {
      id: p.id,
      name: p.name,
      client: clientName,
      status: p.status,
      progress: STATUS_PROGRESS_MAP[p.status] ?? '0',
      value: val > 0 ? `$${val.toLocaleString()}` : '—',
    }
  })

  // Format Pending Approvals
  const approvals: PendingApproval[] = (rawDeliveries || []).map((d) => {
    const rawProj = d.projects
    const projObj = Array.isArray(rawProj) ? rawProj[0] : rawProj
    const rawClient = projObj?.clients
    const clientName = Array.isArray(rawClient)
      ? rawClient[0]?.name
      : rawClient?.name || 'Internal'

    return {
      id: d.id,
      name: d.title,
      project: projObj?.name || 'General',
      client: clientName,
      ext: 'DEL',
    }
  })

  // Format Activity Stream (Stripped server color strings)
  const activities: ActivityEvent[] = (rawActivities || []).map((ev) => {
    const createdDate = new Date(ev.created_at)
    const diffHours = Math.floor(
      (Date.now() - createdDate.getTime()) / (1000 * 60 * 60)
    )

    let timeLabel = `${diffHours}h ago`
    if (diffHours >= 24 && diffHours < 48) timeLabel = 'Yesterday'
    else if (diffHours >= 48) {
      timeLabel = createdDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    }

    return {
      id: ev.id,
      initials: initialsOf(ev.summary || 'Activity', null),
      text: ev.summary,
      time: timeLabel,
    }
  })

  // 4. Team Capacities Calculation (Stripped server color/CSS strings)
  const memberUserIds = (members || []).map((m) => m.user_id)
  const profileMap = new Map<string, string>()

  if (memberUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', memberUserIds)

    profiles?.forEach((p) => profileMap.set(p.id, p.full_name || 'Team Member'))
  }

  const { data: loggedTimes } = await supabase
    .from('time_entries')
    .select('user_id, duration_minutes, projects!inner(org_id)')
    .eq('projects.org_id', org.id)
    .gte('work_date', getStartOfWeekISO())
    .in('user_id', memberUserIds.length > 0 ? memberUserIds : [user.id])

  const dailyCapacity = org.daily_capacity_hours ?? 8
  const daysPerWeek = org.days_per_week ?? 5
  const weeklyTargetHours = dailyCapacity * daysPerWeek || 40

  let overCapacityCount = 0

  const capacities: CapacityRow[] = (members || []).map((m) => {
    const memberName = profileMap.get(m.user_id) || 'Team Member'
    const userMinutes = (loggedTimes || [])
      .filter((entry) => entry.user_id === m.user_id)
      .reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0)

    const pctValue = Math.round((userMinutes / 60 / weeklyTargetHours) * 100)
    const isOverCapacity = pctValue > 100
    if (isOverCapacity) overCapacityCount++

    return {
      id: m.user_id,
      name: memberName,
      initials: initialsOf(memberName, null),
      pctLabel: `${pctValue}%`,
      barPct: `${Math.min(pctValue, 100)}%`,
      pctValue,
      isOverCapacity,
    }
  })

  const hoursToApproveStr = metrics.minutesToApprove
    ? `${(metrics.minutesToApprove / 60).toFixed(1)}h`
    : '0h'

  // Extract nested plan relational data securely
  const planData = Array.isArray(subscription?.plan)
    ? subscription.plan[0]
    : subscription?.plan

  return {
    userName,
    orgName: org.name,
    role,
    stats: [
      {
        label: 'Active Projects',
        value: String(metrics.openProjects),
        delta: `+${metrics.projectsAddedThisMonth} this month`,
        deltaType: 'success',
        iconType: 'info',
        icon: 'projects',
      },
      {
        label: 'Pending Approvals',
        value: String(metrics.pendingApprovals),
        delta: 'Due soon',
        deltaType: 'warning',
        iconType: 'warning',
        icon: 'time',
      },
      {
        label: 'Hours to approve',
        value: hoursToApproveStr,
        delta: `${metrics.timesheetsToApprove} timesheet ${
          metrics.timesheetsToApprove === 1 ? 'entry' : 'entries'
        }`,
        icon: 'status',
        deltaType: 'warning',
        iconType: 'info',
      },
      {
        label: 'Outstanding',
        value: formatCurrency(metrics.outstandingAmount, metrics.currency),
        delta: `${metrics.overdueInvoices} overdue`,
        deltaType: 'destructive',
        iconType: 'destructive',
        icon: 'invoices',
      },
      {
        label: 'Studio MRR',
        value: formatCurrency(metrics.mrrCents / 100, metrics.currency),
        delta: `${metrics.activeSeats} seats active`,
        icon: 'external',
        iconType: 'success',
        deltaType: 'info',
      },
    ],
    approvals,
    projects,
    activities,
    capacities,
    capacityOverCount: overCapacityCount,
    planInfo: {
      name: planData?.name || 'Free Plan',
      status: subscription?.status || 'inactive',
      usedSeats: metrics.activeSeats,
      totalSeats: planData?.seats ?? null,
      renewsAt: subscription?.current_period_end || null,
    },
  }
}

function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}
