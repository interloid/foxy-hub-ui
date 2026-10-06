import { renderToBuffer } from '@react-pdf/renderer'

import {
  buildInvoiceCopy,
  invoiceFileName,
} from '@/features/invoices/lib/invoice-copy'
import { InvoicePdf } from '@/features/invoices/pdf/invoice-pdf'
import { getInvoiceDetail } from '@/features/invoices/queries/get-invoice-detail'
import {
  getFormatter,
  getUserLocale,
  getUserTimeZone,
  getWorkspace,
} from '@/lib/dal'
import { todayIn } from '@/lib/date'
import { formatCurrency } from '@/lib/money'

/**
 * Download PDF on the invoice page. Rendered from the same `buildInvoiceCopy` as the
 * on-screen client copy, with the viewer's locale and zone, so the file says exactly what
 * the preview does.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ org: string; id: string }> }
) {
  const { org, id } = await params

  const workspace = await getWorkspace(org)
  if (!workspace || workspace.role === 'client') {
    return new Response('Not found', { status: 404 })
  }

  const [fmt, locale, timeZone] = await Promise.all([
    getFormatter(),
    getUserLocale(),
    getUserTimeZone(),
  ])

  const invoice = await getInvoiceDetail(workspace.id, id, todayIn(timeZone))
  if (!invoice) return new Response('Not found', { status: 404 })

  const copy = buildInvoiceCopy(invoice, {
    money: (amount) => formatCurrency(amount, invoice.currency, { locale }),
    day: (iso) => fmt.date(iso, 'day'),
  })

  const pdf = await renderToBuffer(<InvoicePdf copy={copy} />)

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoiceFileName(invoice.number)}"`,
      // An invoice changes (paid, voided) - never serve a stale copy.
      'Cache-Control': 'private, no-store',
    },
  })
}
