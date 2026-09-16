'use server'
import { toISODate } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

import { EngagementModel } from '../types'
import {
  InvoiceAllocationRow,
  InvoiceBuildContext,
  InvoiceDraft,
  InvoiceDraftLines,
  InvoiceEntryRow,
  InvoiceLine,
  InvoiceProjectRow,
  ProjectInvoiceContext,
} from '../types/invoice'

export async function buildInvoiceDraft(
  projectId: string,
  orgSlug: string
): Promise<InvoiceDraft | null> {
  const supabase = await createClient()

  const { data: orgData } = await supabase
    .from('organizations')
    .select('id, currency, rounding_minutes, payment_terms_days')
    .eq('slug', orgSlug)
    .single()

  if (!orgData) return null

  const { data: project } = await supabase
    .from('projects')
    .select(
      'id, name, org_id, engagement, contract_value, retainer_hours, retainer_amount, retainer_overage, retainer_period'
    )
    .eq('id', projectId)
    .eq('org_id', orgData.id)
    .single()

  if (!project) return null

  const { data: entries } = await supabase
    .from('time_entries')
    .select('id, user_id, duration_minutes, work_date')
    .eq('project_id', project.id)
    .eq('status', 'approved')
    .is('invoice_id', null)

  const { data: allocations } = await supabase
    .from('project_allocations')
    .select('user_id, rate, effective_from, effective_to')
    .eq('project_id', project.id)

  const memberIds = Array.from(new Set((entries || []).map((e) => e.user_id)))

  const { data: profiles } = memberIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', memberIds)
    : { data: [] }

  const memberNames = new Map<string, string>()
  profiles?.forEach((p) => memberNames.set(p.id, p.full_name || 'Teammate'))

  const period =
    project.engagement === 'retainer'
      ? lastCompletePeriod(
          project.retainer_period === 'weekly' ? 'weekly' : 'monthly'
        )
      : null

  const built = buildInvoiceLines(project, entries || [], allocations || [], {
    memberNames,
    roundingMinutes: orgData.rounding_minutes ?? 15,
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
  })

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + (orgData.payment_terms_days ?? 30))

  return {
    ...built,
    orgId: orgData.id,
    projectId: project.id,
    projectName: project.name,
    engagement: project.engagement as EngagementModel,
    currency: orgData.currency ?? 'USD',
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
    dueDate: dueDate.toISOString(),
  }
}

function lastCompletePeriod(period: 'weekly' | 'monthly'): {
  start: string
  end: string
} {
  const now = new Date()

  if (period === 'weekly') {
    const daysSinceSunday = now.getDay() === 0 ? 7 : now.getDay()
    const end = new Date(now)
    end.setDate(now.getDate() - daysSinceSunday)
    const start = new Date(end)
    start.setDate(end.getDate() - 6)

    return { start: toISODate(start), end: toISODate(end) }
  }

  return {
    start: toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    end: toISODate(new Date(now.getFullYear(), now.getMonth(), 0)),
  }
}

function buildInvoiceLines(
  project: InvoiceProjectRow,
  entries: InvoiceEntryRow[],
  allocations: InvoiceAllocationRow[],
  context: InvoiceBuildContext
): InvoiceDraftLines {
  const { memberNames, roundingMinutes, periodStart, periodEnd } = context

  const lines: InvoiceLine[] = []
  const entryIds: string[] = []
  const unratedNames: string[] = []
  let calloutMessage: string | null = null

  if (
    project.engagement === 'full_time' ||
    project.engagement === 'part_time'
  ) {
    const byUser = new Map<
      string,
      {
        minutes: number
        weighted: number
        rates: Set<number>
        entryIds: string[]
        unrated: boolean
      }
    >()

    for (const entry of entries) {
      const minutes = entry.duration_minutes || 0
      const rate = rateOnDate(allocations, entry.user_id, entry.work_date)

      const acc = byUser.get(entry.user_id) ?? {
        minutes: 0,
        weighted: 0,
        rates: new Set<number>(),
        entryIds: [],
        unrated: false,
      }

      acc.minutes += minutes
      acc.entryIds.push(entry.id)

      if (rate === null) {
        acc.unrated = true
      } else {
        acc.weighted += (minutes / 60) * rate
        acc.rates.add(rate)
      }

      byUser.set(entry.user_id, acc)
    }

    for (const [userId, acc] of byUser) {
      const name = memberNames.get(userId) || 'Teammate'

      if (acc.unrated) {
        unratedNames.push(name)
        continue
      }

      const exactHours = acc.minutes / 60
      const blendedRate = exactHours > 0 ? acc.weighted / exactHours : 0
      const billableHours = roundHoursUp(acc.minutes, roundingMinutes)

      entryIds.push(...acc.entryIds)

      lines.push({
        id: `line-${userId}`,
        description: `${name} — approved hours`,
        typeLabel: 'HOURS',
        qty: formatHours(billableHours),
        rate:
          acc.rates.size > 1
            ? `$${money(blendedRate)}/hr avg`
            : `$${money(blendedRate)}/hr`,
        amount: money(billableHours * blendedRate),
        quantityValue: billableHours,
        unitRateValue: money(blendedRate),
      })
    }
  } else if (project.engagement === 'retainer') {
    const bucketHours = Number(project.retainer_hours) || 0
    const retainerFee = Number(project.retainer_amount) || 0
    const isWeekly = project.retainer_period === 'weekly'

    const multiplier =
      project.retainer_overage === null ||
      project.retainer_overage === undefined
        ? 1
        : Number(project.retainer_overage)

    const periodEntries = entries.filter(
      (e) =>
        (!periodStart || e.work_date >= periodStart) &&
        (!periodEnd || e.work_date <= periodEnd)
    )

    entryIds.push(...periodEntries.map((e) => e.id))

    const consumedMinutes = periodEntries.reduce(
      (sum, e) => sum + (e.duration_minutes || 0),
      0
    )

    const consumedHours = roundHoursUp(consumedMinutes, roundingMinutes)
    const overageHours =
      bucketHours > 0 ? Math.max(0, consumedHours - bucketHours) : 0

    lines.push({
      id: `retainer-${project.id}`,
      description: isWeekly ? 'Weekly retainer' : 'Monthly retainer',
      typeLabel: 'RETAINER',
      qty: `${bucketHours}h bucket`,
      rate: '—',
      amount: money(retainerFee),
      quantityValue: null,
      unitRateValue: null,
    })

    if (overageHours > 0) {
      const impliedRate = retainerFee / bucketHours
      const overageRate = impliedRate * multiplier

      lines.push({
        id: `overage-${project.id}`,
        description: `Overage beyond the ${bucketHours}h bucket`,
        typeLabel: 'OVERAGE',
        qty: formatHours(overageHours),
        rate: `$${money(overageRate)}/hr`,
        amount: money(overageHours * overageRate),
        quantityValue: overageHours,
        unitRateValue: money(overageRate),
      })

      calloutMessage = `Bucket ${formatHours(consumedHours)} of ${bucketHours}h used ${formatHours(overageHours)} billed at ×${multiplier} overage.`
    } else {
      calloutMessage = `Bucket ${formatHours(consumedHours)} of ${bucketHours}h used retainer bills in full even if under-consumed.`
    }
  } else if (project.engagement === 'fixed') {
    const fixedFee = Number(project.contract_value) || 0

    entryIds.push(...entries.map((e) => e.id))

    calloutMessage = 'Hours are tracked for context; the fee is fixed.'
    lines.push({
      id: `fixed-${project.id}`,
      description: 'Fixed project fee',
      typeLabel: 'FIXED',
      qty: '—',
      rate: '—',
      amount: money(fixedFee),
      quantityValue: null,
      unitRateValue: null,
    })
  }

  return {
    lines,
    entryIds,
    calloutMessage,
    unratedNames,
    amount: money(lines.reduce((sum, line) => sum + line.amount, 0)),
  }
}

function rateOnDate(
  allocations: InvoiceAllocationRow[],
  userId: string,
  workDate: string
): number | null {
  const active = allocations.filter(
    (a) =>
      a.user_id === userId &&
      a.effective_from <= workDate &&
      (a.effective_to === null || a.effective_to >= workDate)
  )

  if (active.length === 0) return null

  // Latest start wins when bookings overlap: a later dated row is the correction.
  active.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))

  return active[0].rate === null ? null : Number(active[0].rate)
}

function roundHoursUp(totalMinutes: number, roundingMinutes: number): number {
  const step = roundingMinutes > 0 ? roundingMinutes : 1

  return (Math.ceil(totalMinutes / step) * step) / 60
}

function money(value: number): number {
  return Math.round(value * 100) / 100
}

function formatHours(value: number): string {
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(2)}h`
}

export async function getProjectsForInvoicing(
  orgSlug: string
): Promise<ProjectInvoiceContext[]> {
  const supabase = await createClient()

  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select('id, rounding_minutes')
    .eq('slug', orgSlug)
    .single()

  if (orgError || !orgData) {
    console.error('Organization not found:', orgError)
    return []
  }

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
      retainer_overage,
      retainer_period,
      client:clients (
        name
      )
    `
    )
    .eq('org_id', orgData.id)

  if (projectsError || !projects) {
    console.error('Error fetching projects:', projectsError)
    return []
  }

  const projectIds = projects.map((p) => p.id)

  const { data: timeEntries } = projectIds.length
    ? await supabase
        .from('time_entries')
        .select('id, project_id, user_id, duration_minutes, work_date')
        .in('project_id', projectIds)
        .eq('status', 'approved')
        .is('invoice_id', null)
    : { data: [] }

  const { data: allocations } = projectIds.length
    ? await supabase
        .from('project_allocations')
        .select('project_id, user_id, rate, effective_from, effective_to')
        .in('project_id', projectIds)
    : { data: [] }

  const memberIds = Array.from(
    new Set((timeEntries || []).map((e) => e.user_id))
  )

  const { data: profiles } = memberIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', memberIds)
    : { data: [] }

  const memberNames = new Map<string, string>()
  profiles?.forEach((p) => memberNames.set(p.id, p.full_name || ''))

  const roundingMinutes = orgData.rounding_minutes ?? 15

  return projects.map((project) => {
    const clientName = project.client?.name || 'Client'

    const period =
      project.engagement === 'retainer'
        ? lastCompletePeriod(
            project.retainer_period === 'weekly' ? 'weekly' : 'monthly'
          )
        : null

    const { lines, calloutMessage, unratedNames } = buildInvoiceLines(
      project,
      (timeEntries || []).filter((e) => e.project_id === project.id),
      (allocations || []).filter((a) => a.project_id === project.id),
      {
        memberNames,
        roundingMinutes,
        periodStart: period?.start ?? null,
        periodEnd: period?.end ?? null,
      }
    )

    return {
      id: project.id,
      name: project.name,
      clientName,
      retainerPeriod: project.retainer_period,
      engagement: project.engagement as EngagementModel,
      calloutMessage: withUnratedNotice(calloutMessage, unratedNames),
      lines,
    }
  })
}

function withUnratedNotice(
  calloutMessage: string | null,
  unratedNames: string[]
): string | null {
  if (unratedNames.length === 0) return calloutMessage

  const notice = `No rate in effect for ${unratedNames.join(', ')} their hours are excluded.`

  return calloutMessage ? `${notice} ${calloutMessage}` : notice
}

export async function hasInvoiceForProject(
  projectId: string,
  engagement: string,
  retainerPeriod?: string | null
): Promise<boolean> {
  const supabase = await createClient()

  if (engagement === 'fixed') {
    const { data, error } = await supabase
      .from('invoices')
      .select('id')
      .eq('project_id', projectId)
      .limit(1)
    if (error) throw error
    return (data?.length ?? 0) > 0
  }

  if (engagement !== 'retainer') {
    return false
  }

  const period = lastCompletePeriod(
    retainerPeriod === 'weekly' ? 'weekly' : 'monthly'
  )

  const { data, error } = await supabase
    .from('invoices')
    .select('id')
    .eq('project_id', projectId)
    .eq('period_start', period.start)
    .limit(1)

  if (error) throw error
  return (data?.length ?? 0) > 0
}
