import { getUserTimeZone } from '@/lib/dal'
import {
  shiftISODate,
  startOfDayInstantIn,
  startOfMonthIn,
  todayIn,
} from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

export interface InvoiceMetrics {
  paidThisMonth: number
  outstanding: number
  overdue: number
}

export async function getInvoiceMetrics(
  orgId: string
): Promise<InvoiceMetrics> {
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

  // Fetch relevant invoices for the organization
  const { data: invoices } = await supabase
    .from('invoices')
    .select('amount, status, paid_at, due_date')
    .eq('org_id', orgId)

  if (!invoices) {
    return { paidThisMonth: 0, outstanding: 0, overdue: 0 }
  }

  let paidThisMonth = 0
  let outstanding = 0
  let overdue = 0

  for (const inv of invoices) {
    const amount = Number(inv.amount) || 0

    // 1. Paid this month (status = 'paid' and paid_at falls strictly within current calendar month)
    if (
      inv.status === 'paid' &&
      inv.paid_at &&
      Date.parse(inv.paid_at) >= monthStart &&
      Date.parse(inv.paid_at) < nextMonthStart
    ) {
      paidThisMonth += amount
    }

    // 2. Outstanding (unpaid balance: status is 'due' or 'overdue')
    if (inv.status === 'due' || inv.status === 'overdue') {
      outstanding += amount
    }

    // 3. Overdue (explicit status OR 'due' with expired due date string converted to YYYY-MM-DD)
    const dueDateFormatted = inv.due_date ? inv.due_date.split('T')[0] : null

    if (
      inv.status === 'overdue' ||
      (inv.status === 'due' && dueDateFormatted && dueDateFormatted < today)
    ) {
      overdue += amount
    }
  }

  return { paidThisMonth, outstanding, overdue }
}
