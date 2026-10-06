import 'server-only'

import type {
  InvoiceDetail,
  InvoiceHistoryItem,
  InvoiceHistoryKind,
} from '@/features/invoices/components/detail/types'
import {
  isoDateIn,
  KIND_BY_ENGAGEMENT,
  toListStatus,
} from '@/features/invoices/queries/get-invoices'
import { getFormatter, getUserLocale, getUserTimeZone } from '@/lib/dal'
import { formatCurrency } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

import { daysBetween } from '../lib/dates'

const HISTORY_KIND: Record<string, InvoiceHistoryKind> = {
  invoice_created: 'drafted',
  invoice_sent: 'sent',
  invoice_reminder_sent: 'reminded',
  invoice_paid: 'paid',
}

/** "20h", "20.25h" - as the draft that created the line printed it. */
function hoursLabel(value: number) {
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(2)}h`
}

/**
 * Everything the invoice page shows for one invoice, scoped to the workspace. Null when it
 * doesn't exist there (or the id isn't one).
 *
 * The agency's address and billing email aren't stored yet, so they come back empty and
 * the client copy leaves those lines off. Net days are read off the invoice's own dates,
 * so an agency changing its default terms doesn't rewrite old invoices; the rounding rule
 * is the workspace's current one, since nothing stores it per invoice.
 */
export async function getInvoiceDetail(
  orgId: string,
  invoiceId: string,
  today: string
): Promise<InvoiceDetail | null> {
  if (!z.guid().safeParse(invoiceId).success) return null

  const supabase = await createClient()
  const [timeZone, locale, fmt] = await Promise.all([
    getUserTimeZone(),
    getUserLocale(),
    getFormatter(),
  ])

  const { data: row, error } = await supabase
    .from('invoices')
    .select(
      `
      id, invoice_number, amount, subtotal, tax_amount, currency, status,
      created_at, due_date, paid_at, period_start, period_end, invoice_url,
      organizations ( name, payment_terms_days, rounding_minutes ),
      projects ( id, name, engagement, client_org_id )
    `
    )
    .eq('id', invoiceId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!row) return null

  const org = Array.isArray(row.organizations)
    ? row.organizations[0]
    : row.organizations
  const project = Array.isArray(row.projects) ? row.projects[0] : row.projects

  const [clientRes, linesRes, eventsRes] = await Promise.all([
    project?.client_org_id
      ? supabase
          .from('clients')
          .select('name, contact_name, contact_email')
          .eq('id', project.client_org_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('invoice_lines')
      .select('id, description, type_label, quantity, unit_rate, amount')
      .eq('invoice_id', row.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('activity_events')
      .select('id, type, summary, created_at')
      .eq('entity_type', 'invoice')
      .eq('entity_id', row.id)
      .order('created_at', { ascending: false }),
  ])

  if (linesRes.error) throw new Error(linesRes.error.message)
  if (clientRes.error) console.error('invoice client:', clientRes.error.message)
  if (eventsRes.error)
    console.error('invoice history:', eventsRes.error.message)

  const currency = row.currency || 'USD'
  const money = (value: number) => formatCurrency(value, currency, { locale })

  const issuedOn = isoDateIn(timeZone, row.created_at) ?? today
  const dueDate = isoDateIn(timeZone, row.due_date)
  const status = toListStatus(row.status, dueDate, today)
  const paymentTermsDays = dueDate
    ? Math.max(0, daysBetween(issuedOn, dueDate))
    : (org?.payment_terms_days ?? 30)

  const total = Number(row.amount) || 0
  const taxAmount = Number(row.tax_amount) || 0
  const subtotal = Number(row.subtotal) || total - taxAmount
  const taxRate =
    subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 0

  const engagement = project?.engagement ?? ''
  const period =
    row.period_start && row.period_end
      ? ` · ${fmt.date(row.period_start, 'day')} - ${fmt.date(row.period_end, 'day')}`
      : ''
  const billingBasis =
    engagement === 'retainer'
      ? `Retainer${period}`
      : engagement === 'fixed'
        ? 'Fixed fee'
        : 'Billed on approved hours'

  const lines = (linesRes.data ?? []).map((line) => {
    const quantity = line.quantity === null ? null : Number(line.quantity)
    const rate = line.unit_rate === null ? null : Number(line.unit_rate)
    return {
      id: line.id,
      description: line.description,
      typeLabel: line.type_label,
      // Lines with a quantity bill hours (HOURS, OVERAGE); the flat ones have none.
      qty: quantity === null ? '-' : hoursLabel(quantity),
      rate: rate === null ? '-' : `${money(rate)}/hr`,
      amount: Number(line.amount) || 0,
    }
  })

  const history: InvoiceHistoryItem[] = (eventsRes.data ?? []).map((ev) => ({
    id: ev.id,
    kind: HISTORY_KIND[ev.type] ?? 'event',
    text: ev.summary,
    at: ev.created_at,
  }))

  // Overdue isn't an event anyone logs - the nightly job only flips the status - so it is
  // read off the due date, the same rule the list uses, and slotted in at that date.
  if (status === 'overdue' && dueDate && row.due_date) {
    history.push({
      id: 'overdue',
      kind: 'overdue',
      text: `${daysBetween(dueDate, today)}d overdue - payment terms were Net ${paymentTermsDays}`,
      at: row.due_date,
    })
    history.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  }

  return {
    id: row.id,
    number: row.invoice_number || `INV-${row.id.slice(0, 4).toUpperCase()}`,
    status,
    kind: KIND_BY_ENGAGEMENT[engagement] ?? 'hours',
    currency,
    issuedOn,
    dueDate,
    paidAt: isoDateIn(timeZone, row.paid_at),
    paymentTermsDays,
    roundingMinutes: org?.rounding_minutes ?? 15,

    agency: {
      name: org?.name ?? 'Your agency',
      addressLines: [],
      email: null,
    },
    client: {
      name: clientRes.data?.name ?? 'Internal',
      contactName: clientRes.data?.contact_name ?? null,
      contactEmail: clientRes.data?.contact_email ?? null,
    },
    project: {
      id: project?.id ?? '',
      name: project?.name ?? 'Unknown project',
      billingBasis,
    },

    lines,
    subtotal,
    taxRate,
    taxAmount,
    total,

    invoiceUrl: row.invoice_url ?? null,
    history,
  }
}
