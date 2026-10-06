import { supabase } from './clients.ts'

export interface PaidInvoiceRow {
  id: string
  org_id: string
  project_id: string | null
  invoice_number: string | null
  amount: number | string | null
  currency: string | null
  due_date: string | null
}

/** The `invoice_paid` line in the activity feed - a system event, so no actor. */
export async function logInvoicePaid(invoice: PaidInvoiceRow) {
  const amount = Number(invoice.amount)
  const money = Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: invoice.currency || 'USD',
        // Plain "$", never "US$", whatever the locale above becomes.
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 0,
      }).format(amount)
    : null

  // What it was before it settled, as the Invoices table shows it: `due` past its date
  // reads as Overdue there even before the nightly job flips it.
  const wasOverdue =
    invoice.due_date !== null && new Date(invoice.due_date) < new Date()

  let clientName: string | null = null
  if (invoice.project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('clients(name)')
      .eq('id', invoice.project_id)
      .maybeSingle()
    const client = Array.isArray(project?.clients)
      ? project?.clients[0]
      : project?.clients
    clientName = client?.name ?? null
  }

  const { error } = await supabase.from('activity_events').insert({
    org_id: invoice.org_id,
    actor_id: null,
    actor_kind: 'system',
    type: 'invoice_paid',
    summary: `Invoice ${invoice.invoice_number} was paid${money ? ` - ${money}` : ''}`,
    project_id: invoice.project_id,
    entity_type: 'invoice',
    entity_id: invoice.id,
    payload: {
      invoice_number: invoice.invoice_number,
      amount: invoice.amount,
      changes: [
        { label: 'Status', from: wasOverdue ? 'Overdue' : 'Sent', to: 'Paid' },
      ],
      note: clientName ? `Stripe · ${clientName}` : 'Stripe',
    },
  })

  if (error) {
    console.error(
      'activity_events insert failed (invoice_paid):',
      error.message
    )
  }
}
