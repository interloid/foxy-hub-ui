import type { InvoiceDetail } from '../components/detail/types'

/**
 * Everything the client copy SAYS, already formatted. The on-screen preview and the PDF
 * both render from this, so "Exactly what Download PDF produces" stays true: wording,
 * money and dates are decided once, and the two renderers only lay them out.
 */
export interface InvoiceCopy {
  number: string
  agency: { initial: string; name: string; lines: string[] }
  billedTo: { name: string; lines: string[] }
  project: string[]
  dates: { label: string; value: string; emphasis?: boolean }[]
  lines: {
    id: string
    description: string
    typeLabel: string
    qty: string
    rate: string
    amount: string
  }[]
  totals: { label: string; value: string }[]
  amountDue: string
  howToPay: { before: string; reference: string; after: string }
  terms: string
  footer: string
}

export function buildInvoiceCopy(
  invoice: InvoiceDetail,
  format: { money: (amount: number) => string; day: (iso: string) => string }
): InvoiceCopy {
  return {
    number: invoice.number,
    agency: {
      initial: invoice.agency.name.charAt(0).toUpperCase(),
      name: invoice.agency.name,
      // Empty for now: the workspace has no address or billing email to print yet.
      lines: [...invoice.agency.addressLines, invoice.agency.email].filter(
        (line): line is string => Boolean(line?.trim())
      ),
    },
    billedTo: {
      name: invoice.client.name,
      lines: [invoice.client.contactName, invoice.client.contactEmail].filter(
        (line): line is string => Boolean(line)
      ),
    },
    project: [invoice.project.name, invoice.project.billingBasis],
    dates: [
      { label: 'Issued', value: format.day(invoice.issuedOn) },
      ...(invoice.dueDate
        ? [{ label: 'Due', value: format.day(invoice.dueDate), emphasis: true }]
        : []),
      { label: 'Terms', value: `Net ${invoice.paymentTermsDays}` },
    ],
    lines: invoice.lines.map((line) => ({
      id: line.id,
      description: line.description,
      typeLabel: line.typeLabel,
      qty: line.qty,
      rate: line.rate,
      amount: format.money(line.amount),
    })),
    totals: [
      { label: 'Subtotal', value: format.money(invoice.subtotal) },
      {
        label: `Tax (${invoice.taxRate}%)`,
        value: format.money(invoice.taxAmount),
      },
    ],
    amountDue: format.money(invoice.total),
    howToPay: {
      before:
        'Card or bank debit through the secure Stripe link in your email. Reference ',
      reference: invoice.number,
      after: ' on any manual transfer.',
    },
    terms: `Payable Net ${invoice.paymentTermsDays} from the issue date. Time is rounded up to the nearest ${invoice.roundingMinutes} min at invoicing, and the rule is printed on the client copy.`,
    footer: `${invoice.agency.name} · Thank you for your business`,
  }
}

/** `INV-019.pdf` - the download's file name. */
export function invoiceFileName(number: string) {
  return `${number.replace(/[^A-Za-z0-9_-]+/g, '-')}.pdf`
}
