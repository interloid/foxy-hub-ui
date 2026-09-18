'use server'
import { toISODate } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

import { NON_INVOICEABLE_STATUSES } from '../constants'
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
      'id, name, org_id, engagement, status, start_date, due_date, created_at, contract_value, retainer_hours, retainer_amount, retainer_overage, retainer_period'
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

  const { windowStart, windowEnd } = resolveInvoiceWindow(project)

  const { data: projectInvoices } = await supabase
    .from('invoices')
    .select('amount')
    .eq('project_id', project.id)

  const existingInvoiceCount = projectInvoices?.length ?? 0
  const alreadyInvoicedAmount = (projectInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.amount || 0),
    0
  )

  const { data: unApprovedEntries } = await supabase
    .from('time_entries')
    .select('id, user_id, duration_minutes, work_date')
    .eq('project_id', project.id)
    .in('status', ['draft', 'submitted'])
    .is('invoice_id', null)

  const built = buildInvoiceLines(
    project,
    entries || [],
    allocations || [],
    {
      memberNames,
      roundingMinutes: orgData.rounding_minutes ?? 15,
      periodStart: period?.start ?? null,
      periodEnd: period?.end ?? null,
      windowStart,
      windowEnd,
      existingInvoiceCount,
      alreadyInvoicedAmount,
    },
    unApprovedEntries || []
  )

  const invoiceDueDate = new Date()
  invoiceDueDate.setDate(
    invoiceDueDate.getDate() + (orgData.payment_terms_days ?? 30)
  )

  return {
    ...built,
    orgId: orgData.id,
    projectId: project.id,
    projectName: project.name,
    engagement: project.engagement as EngagementModel,
    status: project.status,
    currency: orgData.currency ?? 'USD',
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
    dueDate: invoiceDueDate.toISOString(),
  }
}

function resolveInvoiceWindow(project: {
  start_date: string | null
  due_date: string | null
  created_at: string
}): { windowStart: string; windowEnd: string | null } {
  return {
    windowStart: project.start_date ?? toISODate(new Date(project.created_at)),
    windowEnd: project.due_date ? toISODate(new Date(project.due_date)) : null,
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
  context: InvoiceBuildContext,
  unApprovedEntries: InvoiceEntryRow[] = []
): InvoiceDraftLines {
  const {
    memberNames,
    roundingMinutes,
    periodStart,
    periodEnd,
    windowStart,
    windowEnd,
    existingInvoiceCount,
    alreadyInvoicedAmount,
  } = context

  const lines: InvoiceLine[] = []
  const entryIds: string[] = []
  const unratedNames: string[] = []
  const outOfRangeNames = new Set<string>()
  let calloutMessage: string | null = null

  entries = entries.filter((entry) => {
    const afterStart = !windowStart || entry.work_date >= windowStart
    const beforeEnd = !windowEnd || entry.work_date <= windowEnd

    if (afterStart && beforeEnd) return true

    outOfRangeNames.add(memberNames.get(entry.user_id) || 'Teammate')
    return false
  })

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

    if (project.status === 'pending-approval' && lines.length === 0) {
      const contractValue = project.contract_value ?? 0
      const remaining = contractValue - (alreadyInvoicedAmount ?? 0)

      if (remaining > 0) {
        if (unApprovedEntries.length > 0) {
          calloutMessage =
            'Your logged work hours have not been submitted for approval, or they are currently under review. Once the work hours are approved, you can generate the invoice.'
        } else {
          lines.push({
            id: `line-${project.id}`,
            description: 'Remaining unbilled amount',
            typeLabel: 'BALANCE',
            qty: '-',
            rate: '-',
            amount: money(remaining),
            quantityValue: null,
            unitRateValue: null,
          })
        }
      }
    }
  } else if (project.engagement === 'retainer') {
    if (windowEnd && periodStart && periodStart > windowEnd) {
      calloutMessage = `This project's due date (${windowEnd}) has passed no further retainer periods are billable.`
    } else {
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
    }
  } else if (project.engagement === 'fixed') {
    const fixedFee = Number(project.contract_value) || 0
    const invoiceCount = existingInvoiceCount ?? 0
    const invoicedSoFar = alreadyInvoicedAmount ?? 0

    entryIds.push(...entries.map((e) => e.id))

    if (invoiceCount >= 2) {
      calloutMessage =
        'This fixed-price project has already been fully invoiced.'
    } else if (invoiceCount === 0) {
      if (project.status === 'in-progress') {
        lines.push({
          id: `fixed-1-${project.id}`,
          description: 'Fixed project fee — project start (1 of 2)',
          typeLabel: 'FIXED',
          qty: '—',
          rate: '—',
          amount: money(fixedFee * 0.5),
          quantityValue: null,
          unitRateValue: null,
        })
        calloutMessage =
          'First of two fixed-price invoices — 50% on project start. Hours are tracked for context; the fee is fixed.'
      } else {
        calloutMessage = `The first fixed-price invoice bills once the project is in progress (currently ${project.status}).`
      }
    } else {
      if (project.status === 'pending-approval') {
        lines.push({
          id: `fixed-2-${project.id}`,
          description: 'Fixed project fee — pending approval (2 of 2)',
          typeLabel: 'FIXED',
          qty: '—',
          rate: '—',
          amount: money(fixedFee - invoicedSoFar),
          quantityValue: null,
          unitRateValue: null,
        })
        calloutMessage =
          'Final fixed-price invoice — remaining balance on pending approval. Hours are tracked for context; the fee is fixed.'
      } else {
        calloutMessage = `The final fixed-price invoice bills once the project is pending approval (currently ${project.status}).`
      }
    }
  }

  return {
    lines,
    entryIds,
    calloutMessage,
    unratedNames,
    outOfRangeNames: Array.from(outOfRangeNames),
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
  const { data: allProjects, error: projectsError } = await supabase
    .from('projects')
    .select(
      `
      id,
      name,
      engagement,
      status,
      start_date,
      due_date,
      created_at,
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

  if (projectsError || !allProjects) {
    console.error('Error fetching projects:', projectsError)
    return []
  }

  // Draft/cancelled/completed projects are never eligible for a new invoice.
  const projects = allProjects.filter(
    (p) => !NON_INVOICEABLE_STATUSES.has(p.status)
  )

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

  const { data: projectInvoices } = projectIds.length
    ? await supabase
        .from('invoices')
        .select('project_id, amount')
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

    const { windowStart, windowEnd } = resolveInvoiceWindow(project)

    const invoicesForProject = (projectInvoices || []).filter(
      (i) => i.project_id === project.id
    )
    const existingInvoiceCount = invoicesForProject.length
    const alreadyInvoicedAmount = invoicesForProject.reduce(
      (sum, i) => sum + Number(i.amount || 0),
      0
    )

    const { lines, calloutMessage, unratedNames, outOfRangeNames } =
      buildInvoiceLines(
        project,
        (timeEntries || []).filter((e) => e.project_id === project.id),
        (allocations || []).filter((a) => a.project_id === project.id),
        {
          memberNames,
          roundingMinutes,
          periodStart: period?.start ?? null,
          periodEnd: period?.end ?? null,
          windowStart,
          windowEnd,
          existingInvoiceCount,
          alreadyInvoicedAmount,
        }
      )

    return {
      id: project.id,
      name: project.name,
      clientName,
      retainerPeriod: project.retainer_period,
      engagement: project.engagement as EngagementModel,
      calloutMessage: withInvoiceNotices(
        calloutMessage,
        unratedNames,
        outOfRangeNames
      ),
      lines,
    }
  })
}

function withInvoiceNotices(
  calloutMessage: string | null,
  unratedNames: string[],
  outOfRangeNames: string[]
): string | null {
  const notices: string[] = []

  if (unratedNames.length > 0) {
    notices.push(
      `No rate in effect for ${unratedNames.join(', ')} their hours are excluded.`
    )
  }

  if (outOfRangeNames.length > 0) {
    notices.push(
      `Hours logged outside the project's start due window for ${outOfRangeNames.join(', ')} are excluded.`
    )
  }

  if (notices.length === 0) return calloutMessage

  return calloutMessage
    ? `${notices.join(' ')} ${calloutMessage}`
    : notices.join(' ')
}

export async function hasInvoiceForProject(
  projectId: string,
  engagement: string,
  retainerPeriod?: string | null
): Promise<boolean> {
  const supabase = await createClient()

  if (engagement === 'fixed') {
    // Fixed projects bill in two stages now, so "already invoiced" only means fully invoiced —
    // one existing invoice still leaves the second stage open once the project reaches
    // `pending-approval`.
    const { data, error } = await supabase
      .from('invoices')
      .select('id')
      .eq('project_id', projectId)
      .limit(2)
    if (error) throw error
    return (data?.length ?? 0) >= 2
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
