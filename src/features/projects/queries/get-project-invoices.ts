import 'server-only'

import type { InvoiceListStatus } from '@/features/invoices/components/list/types'
import {
  isoDateIn,
  toListStatus,
} from '@/features/invoices/queries/get-invoices'
import { getUserTimeZone } from '@/lib/dal'
import { todayIn } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

export interface ProjectInvoiceRow {
  id: string
  number: string
  amount: number
  status: InvoiceListStatus
  /** ISO date. */
  dueDate: string | null
  /** Stripe-hosted invoice page, once the invoice has been issued. */
  invoiceUrl: string | null
}

/** Every invoice raised against one project, newest first. */
export async function getProjectInvoices(
  projectId: string
): Promise<ProjectInvoiceRow[]> {
  const supabase = await createClient()
  const timeZone = await getUserTimeZone()
  const today = todayIn(timeZone)

  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, amount, status, due_date, invoice_url')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const dueDate = isoDateIn(timeZone, row.due_date)
    return {
      id: row.id,
      number: row.invoice_number || `INV-${row.id.slice(0, 4).toUpperCase()}`,
      amount: Number(row.amount) || 0,
      status: toListStatus(row.status, dueDate, today),
      dueDate,
      invoiceUrl: row.invoice_url ?? null,
    }
  })
}
