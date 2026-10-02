import 'server-only'

import type {
  InvoiceClientOption,
  InvoiceKind,
  InvoiceListStatus,
  InvoiceRow,
} from '@/features/invoices/components/list/types'
import { getUserTimeZone } from '@/lib/dal'
import { dateIn, todayIn } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

interface InvoiceProjectRelation {
  name: string
  engagement: string
  /** The client COMPANY (`clients.id`), not the portal login in `client_id`. */
  client_org_id: string | null
}

const KIND_BY_ENGAGEMENT: Record<string, InvoiceKind> = {
  retainer: 'retainer',
  fixed: 'fixed',
  budget: 'hours',
  hourly: 'hours',
}

/** The calendar day of a timestamptz in the user's zone - slicing the string would read UTC. */
function isoDateIn(timeZone: string, value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : dateIn(timeZone, date)
}

/**
 * Every invoice in the workspace for the Invoices table, newest first. The table filters,
 * searches and paginates in the browser, so all rows are returned at once - fine for the
 * hundreds an agency issues; this is where server-side paging would go if that changes.
 */
export async function getInvoiceRows(orgId: string): Promise<{
  invoices: InvoiceRow[]
  clients: InvoiceClientOption[]
  today: string
}> {
  const supabase = await createClient()
  const timeZone = await getUserTimeZone()
  const today = todayIn(timeZone)

  const { data, error } = await supabase
    .from('invoices')
    .select(
      `
      id,
      invoice_number,
      amount,
      status,
      due_date,
      paid_at,
      invoice_url,
      projects (
        name,
        engagement,
        client_org_id
      )
    `
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error || !data) {
    console.error('getInvoiceRows error:', error?.message)
    return { invoices: [], clients: [], today }
  }

  const projectOf = (row: (typeof data)[number]) =>
    (Array.isArray(row.projects)
      ? row.projects[0]
      : row.projects) as InvoiceProjectRelation | null

  const clientIds = [
    ...new Set(
      data.flatMap((row) => {
        const id = projectOf(row)?.client_org_id
        return id ? [id] : []
      })
    ),
  ]

  const clientNames = new Map<string, string>()
  if (clientIds.length > 0) {
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name, contact_name, contact_email')
      .in('id', clientIds)
      .eq('org_id', orgId)

    if (clientsError) {
      console.error('getInvoiceRows clients:', clientsError.message)
    }
    for (const c of clients ?? []) {
      clientNames.set(
        c.id,
        c.name || c.contact_name || c.contact_email || 'Client'
      )
    }
  }

  const invoices: InvoiceRow[] = data.map((row) => {
    const project = projectOf(row)
    const clientId = project?.client_org_id ?? null
    const dueDate = isoDateIn(timeZone, row.due_date)

    // Same rule as the Overdue card: past its date counts as overdue even if the nightly
    // job hasn't updated the stored status yet.
    const status: InvoiceListStatus =
      row.status === 'due'
        ? dueDate !== null && dueDate < today
          ? 'overdue'
          : 'sent'
        : row.status

    return {
      id: row.id,
      number: row.invoice_number || `INV-${row.id.slice(0, 4).toUpperCase()}`,
      kind: KIND_BY_ENGAGEMENT[project?.engagement ?? ''] ?? 'hours',
      projectName: project?.name ?? 'Unknown project',
      clientId,
      clientName: clientId
        ? (clientNames.get(clientId) ?? 'Client')
        : 'Internal',
      amount: Number(row.amount) || 0,
      status,
      dueDate,
      paidAt: isoDateIn(timeZone, row.paid_at),
      invoiceUrl: row.invoice_url ?? null,
    }
  })

  // The client filter only lists clients that actually have invoices.
  const clients = [...clientNames.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { invoices, clients, today }
}
