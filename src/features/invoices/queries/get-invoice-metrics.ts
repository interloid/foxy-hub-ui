import type { InvoiceSummary } from '@/features/invoices/components/list/types'
import { NON_INVOICEABLE_STATUSES } from '@/features/projects/constants'
import type { ProjectInvoiceContext } from '@/features/projects/types/invoice'
import { getUserTimeZone } from '@/lib/dal'
import {
  dateIn,
  shiftISODate,
  startOfDayInstantIn,
  startOfMonthIn,
  todayIn,
} from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

/** Engagements whose `contract_value` is a total to invoice against over the project. */
const DRAWN_ENGAGEMENTS = new Set(['fixed', 'budget'])

/** Draft lines that are approved, unbilled hours - not fixed stages or retainer fees. */
const HOURS_LINE_TYPES = new Set(['HOURS', 'OVERAGE'])

export type InvoiceStatusSummary = Omit<
  InvoiceSummary,
  'readyToBill' | 'readyToBillProjects'
>

/**
 * Paid this month, Outstanding, Overdue and Left to draw - everything the Invoices cards show
 * except Ready to bill, which comes from the invoice drafts (`readyToBillFromDrafts`).
 */
export async function getInvoiceMetrics(
  orgId: string
): Promise<InvoiceStatusSummary> {
  const supabase = await createClient()

  // This calendar month and "today" in the USER's zone, as instants for `paid_at`.
  const timeZone = await getUserTimeZone()
  const monthStartDate = startOfMonthIn(timeZone)
  const nextMonthStartDate = startOfMonthIn(
    'UTC',
    new Date(`${shiftISODate(monthStartDate, 31)}T00:00:00Z`)
  )
  const monthStart = Date.parse(startOfDayInstantIn(timeZone, monthStartDate))
  const nextMonthStart = Date.parse(
    startOfDayInstantIn(timeZone, nextMonthStartDate)
  )
  const today = todayIn(timeZone)

  const [invoicesRes, projectsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('project_id, amount, status, paid_at, due_date')
      .eq('org_id', orgId),
    supabase
      .from('projects')
      .select('id, engagement, status, contract_value')
      .eq('org_id', orgId),
  ])

  if (invoicesRes.error) {
    console.error('getInvoiceMetrics invoices:', invoicesRes.error.message)
  }
  if (projectsRes.error) {
    console.error('getInvoiceMetrics projects:', projectsRes.error.message)
  }

  const summary: InvoiceStatusSummary = {
    paidThisMonth: 0,
    settledCount: 0,
    outstanding: 0,
    outstandingCount: 0,
    overdue: 0,
    overdueCount: 0,
    leftToDraw: 0,
    leftToDrawContracts: 0,
  }

  const invoicedByProject = new Map<string, number>()

  for (const inv of invoicesRes.data ?? []) {
    const amount = Number(inv.amount) || 0

    // A cancelled invoice bills nothing, so it never counts as drawn.
    if (inv.status !== 'cancelled') {
      invoicedByProject.set(
        inv.project_id,
        (invoicedByProject.get(inv.project_id) ?? 0) + amount
      )
    }

    if (inv.status === 'paid') {
      summary.settledCount += 1
      if (
        inv.paid_at &&
        Date.parse(inv.paid_at) >= monthStart &&
        Date.parse(inv.paid_at) < nextMonthStart
      ) {
        summary.paidThisMonth += amount
      }
    }

    // Outstanding: issued and unpaid.
    if (inv.status === 'due' || inv.status === 'overdue') {
      summary.outstanding += amount
      summary.outstandingCount += 1
    }

    // Overdue: the stored status, or still `due` with its date passed - the nightly job
    // that flips `due` to `overdue` may not have run yet.
    // The due day in the user's zone, matching the Invoices table.
    const dueDate = inv.due_date
      ? dateIn(timeZone, new Date(inv.due_date))
      : null
    if (
      inv.status === 'overdue' ||
      (inv.status === 'due' && dueDate !== null && dueDate < today)
    ) {
      summary.overdue += amount
      summary.overdueCount += 1
    }
  }

  // Left to draw: what each live fixed-fee or budget contract can still be invoiced for.
  for (const project of projectsRes.data ?? []) {
    if (!DRAWN_ENGAGEMENTS.has(project.engagement)) continue
    if (NON_INVOICEABLE_STATUSES.has(project.status)) continue

    const contract = Number(project.contract_value) || 0
    const remaining = contract - (invoicedByProject.get(project.id) ?? 0)
    if (remaining > 0) {
      summary.leftToDraw += remaining
      summary.leftToDrawContracts += 1
    }
  }

  return summary
}

/**
 * Ready to bill, from the same drafts the New invoice sheet shows: approved, unbilled,
 * billable hours on live projects, priced exactly as the invoice would be.
 */
export function readyToBillFromDrafts(projects: ProjectInvoiceContext[]): {
  readyToBill: number
  readyToBillProjects: number
} {
  let readyToBill = 0
  let readyToBillProjects = 0

  for (const project of projects) {
    const hours = project.lines
      .filter((line) => HOURS_LINE_TYPES.has(line.typeLabel))
      .reduce((sum, line) => sum + (Number(line.amount) || 0), 0)

    if (hours > 0) {
      readyToBill += hours
      readyToBillProjects += 1
    }
  }

  return { readyToBill, readyToBillProjects }
}
