import { getDashboardMetrics } from '@/lib/dal'
import { initialsOf } from '@/lib/initials'
import { createClient } from '@/lib/supabase/server'
import { getStartOfWeekISO } from '@/lib/week'
import { ActivityEvent, CapacityRow, DashboardData, UserRole } from './types'

export async function getDashboardData(
  orgSlug: string
): Promise<DashboardData> {
  const supabase = await createClient()

  // 1. Get current authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // 2. Fetch organization by slug
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, currency, daily_capacity_hours, days_per_week')
    .eq('slug', orgSlug)
    .single()

  if (orgError || !org) {
    throw new Error('Organization not found')
  }

  const orgId = org.id

  // 3. Get user membership and role in this org
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()

  const role: UserRole = membership?.role || 'member'

  // Fetch user profile for display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const rawName =
    profile?.full_name || user.user_metadata?.full_name || user.email || 'User'
  const userName = rawName.split(' ')[0]

  // 4. Fetch Active Projects with Client details
  const { data: rawProjects } = await supabase
    .from('projects')
    .select(
      `
      id,
      name,
      status,
      contract_value,
      retainer_amount,
      clients (
        name
      )
    `
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(5)

  const projects = (rawProjects || []).map((p) => {
    const clientName = Array.isArray(p.clients)
      ? p.clients[0]?.name
      : p.clients?.name || 'Internal'

    let statusBg = 'var(--panel2, #f1f3f4)'
    let statusColor = 'var(--text2, #5f6368)'

    if (p.status === 'in-progress') {
      statusBg = 'var(--amberWeak, #fef7e0)'
      statusColor = 'var(--amber, #b06000)'
    } else if (p.status === 'completed') {
      statusBg = 'var(--greenWeak, #e6f4ea)'
      statusColor = 'var(--green, #137333)'
    } else if (p.status === 'on-hold' || p.status === 'cancelled') {
      statusBg = 'var(--redWeak, #fce8e6)'
      statusColor = 'var(--red, #c5221f)'
    }

    const val = p.contract_value || p.retainer_amount || 0
    const formattedValue = val > 0 ? `$${val.toLocaleString()}` : '—'

    return {
      id: p.id,
      name: p.name,
      client: clientName,
      status: p.status,
      statusBg,
      statusColor,
      progress: p.status === 'completed' ? '100' : '65',
      value: formattedValue,
    }
  })

  // 5. Fetch Pending Approvals from Deliveries
  const { data: rawDeliveries } = await supabase
    .from('deliveries')
    .select(
      `
      id,
      title,
      status,
      projects (
        name,
        clients (
          name
        )
      )
    `
    )
    .eq('org_id', orgId)
    .in('status', ['pending', 'submitted'])
    .order('created_at', { ascending: false })
    .limit(4)

  const approvals = (rawDeliveries || []).map((d) => {
    const projName = Array.isArray(d.projects)
      ? d.projects[0]?.name
      : d.projects?.name
    const clientObj = Array.isArray(d.projects)
      ? d.projects[0]?.clients
      : d.projects?.clients
    const clientName = Array.isArray(clientObj)
      ? clientObj[0]?.name
      : clientObj?.name || 'Internal'

    return {
      id: d.id,
      name: d.title,
      project: projName || 'General',
      client: clientName,
      ext: 'DEL',
      iconBg: 'var(--panel2, #f1f3f4)',
      iconColor: 'var(--text2, #5f6368)',
      done: d.status === 'approved',
      pending: d.status === 'pending' || d.status === 'submitted',
    }
  })

  // 6. Fetch Activity Logs from `activity_events`
  const { data: rawActivities } = await supabase
    .from('activity_events')
    .select('id, summary, created_at, actor_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(5)

  const activities: ActivityEvent[] = (rawActivities || []).map((ev) => {
    const createdDate = new Date(ev.created_at)
    const initials = initialsOf(ev.summary || 'Activity', null)

    let avatarBg = 'var(--panel2, #e8eaed)'
    let avatarColor = 'var(--text, #202124)'

    if (
      ev.summary?.toLowerCase().includes('invoice') ||
      ev.summary?.includes('$')
    ) {
      avatarBg = 'rgba(19, 115, 51, 0.15)'
      avatarColor = '#137333'
    } else if (ev.summary?.toLowerCase().includes('approved')) {
      avatarBg = 'rgba(26, 115, 232, 0.15)'
      avatarColor = '#1a73e8'
    } else {
      avatarBg = 'rgba(230, 120, 23, 0.15)'
      avatarColor = '#e67817'
    }

    const now = new Date()
    const diffHours = Math.floor(
      (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60)
    )
    let timeLabel = `${diffHours}h ago`

    if (diffHours >= 24 && diffHours < 48) {
      timeLabel = 'Yesterday'
    } else if (diffHours >= 48) {
      timeLabel = createdDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    }

    return {
      id: ev.id,
      initials,
      avatarBg,
      avatarColor,
      text: ev.summary,
      time: timeLabel,
    }
  })

  // 7. Calculate Active Subscriptions & Plan Seats
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select(
      `
      status,
      current_period_end,
      plans (
        name,
        seats
      )
    `
    )
    .eq('org_id', orgId)
    .single()

  const { count: memberCount } = await supabase
    .from('memberships')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)

  const planObj = Array.isArray(subscription?.plans)
    ? subscription?.plans[0]
    : subscription?.plans

  const planInfo = {
    name: planObj?.name || 'Studio Plan',
    status: subscription?.status || 'active',
    usedSeats: memberCount || 1,
    totalSeats: planObj?.seats || 5,
    renewsAt: subscription?.current_period_end
      ? new Date(subscription.current_period_end).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      : null,
  }

  // 8. Fetch Dynamic Team Capacity (Excluding client role)
  const { data: members } = await supabase
    .from('memberships')
    .select('user_id, role')
    .eq('org_id', orgId)
    .neq('role', 'client')

  const memberUserIds = (members || []).map((m) => m.user_id)

  const profileMap = new Map<string, string>()

  if (memberUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', memberUserIds)

    if (profiles) {
      profiles.forEach((p) => {
        profileMap.set(p.id, p.full_name || 'Team Member')
      })
    }
  }

  const weekStart = getStartOfWeekISO()

  const { data: loggedTimes } = await supabase
    .from('time_entries')
    .select('user_id, duration_minutes, projects!inner(org_id)')
    .eq('projects.org_id', orgId)
    .gte('work_date', weekStart)
    .in('user_id', memberUserIds.length > 0 ? memberUserIds : [user.id])

  const dailyTarget = org?.daily_capacity_hours || 8
  const daysPerWeek = org?.days_per_week || 5
  const weeklyTargetHours = dailyTarget * daysPerWeek || 40

  let overCapacityCount = 0

  const capacities: CapacityRow[] = (members || []).map((m) => {
    const memberName = profileMap.get(m.user_id) || 'Team Member'
    const initials = initialsOf(memberName, null)

    const targetUserId = String(m.user_id || '')
      .trim()
      .toLowerCase()

    const userMinutes = (loggedTimes || [])
      .filter(
        (entry) =>
          String(entry.user_id || '')
            .trim()
            .toLowerCase() === targetUserId
      )
      .reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0)

    const totalHours = userMinutes / 60
    const pctValue = Math.round((totalHours / weeklyTargetHours) * 100)
    const isOverCapacity = pctValue > 100

    if (isOverCapacity) {
      overCapacityCount++
    }

    return {
      id: m.user_id,
      name: memberName,
      initials,
      pctLabel: `${pctValue}%`,
      barPct: `${Math.min(pctValue, 100)}%`,
      pctValue,
      isOverCapacity,
      barColor: isOverCapacity ? '#c5221f' : '#137333',
      pctColor: isOverCapacity ? 'text-primary' : 'text-success',
      avatarColor: 'bg-accent text-foreground',
    }
  })

  // 9. Fetch Real Aggregated Dashboard Metrics via DAL
  const metrics = await getDashboardMetrics(orgSlug)
  const currency = metrics?.currency || org.currency || 'USD'

  const hoursToApproveStr = metrics?.minutesToApprove
    ? `${(metrics.minutesToApprove / 60).toFixed(1)}h`
    : '0h'

  return {
    userName,
    orgName: org.name,
    role,
    stats: [
      {
        label: 'Active Projects',
        value: String(metrics?.openProjects ?? 0),
        delta: `+${metrics?.projectsAddedThisMonth ?? 0} this month`,
        deltaColor: '#137333',
        deltaType: 'success',
        iconType: 'info',
        icon: 'projects',
      },
      {
        label: 'Pending Approvals',
        value: String(approvals.length),
        delta: 'Due soon',
        deltaColor: '#b06000',
        deltaType: 'warning',
        iconType: 'warning',
        icon: 'time',
      },
      {
        label: 'Hours to approve',
        value: hoursToApproveStr,
        delta: `${metrics?.timesheetsToApprove ?? 0} timesheet ${
          metrics?.timesheetsToApprove === 1 ? 'entry' : 'entries'
        }`,
        deltaColor: '#1a73e8',
        icon: 'status',
        deltaType: 'warning',
        iconType: 'info',
      },
      {
        label: 'Outstanding',
        value: formatCurrency(metrics?.outstandingAmount ?? 0, currency),
        delta: `${metrics?.overdueInvoices ?? 0} overdue`,
        deltaColor: '#c5221f',
        deltaType: 'destructive',
        iconType: 'destructive',
        icon: 'invoices',
      },
      {
        label: 'Studio MRR',
        value: formatCurrency((metrics?.mrrCents ?? 0) / 100, currency),
        delta: `${metrics?.activeSeats ?? planInfo.usedSeats} seats active`,
        deltaColor: '#c5221f',
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
    planInfo,
  }
}

function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}
