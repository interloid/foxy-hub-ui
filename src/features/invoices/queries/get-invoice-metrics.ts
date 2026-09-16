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

  const now = new Date()
  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString()
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString()
  const today = now.toISOString().split('T')[0]

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
      inv.paid_at >= startOfMonth &&
      inv.paid_at <= endOfMonth
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
