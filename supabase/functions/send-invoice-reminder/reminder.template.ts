/**
 * Payment reminder, sent when staff press Remind on the Invoices page.
 *
 * Same look as the overdue notice (invoice-overdue-handler/invoice.template.ts): raw hex
 * because mail clients strip <style> and CSS variables, and every user-supplied string
 * escaped before it reaches the HTML.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type InvoiceReminderEmail = {
  orgName: string
  projectName: string
  invoiceNumber: string
  /** Pre-formatted for the invoice's own currency, e.g. "₹12,500.00". */
  amountLabel: string
  /** Pre-formatted, e.g. "3 August 2026". Empty when the invoice has no due date. */
  dueDateLabel: string
  isOverdue: boolean
  /** Where the client pays: the Stripe-hosted invoice, or the invoice in the client portal. */
  payUrl: string
}

export function invoiceReminderTemplate({
  orgName,
  projectName,
  invoiceNumber,
  amountLabel,
  dueDateLabel,
  isOverdue,
  payUrl,
}: InvoiceReminderEmail) {
  const org = escapeHtml(orgName)
  const project = escapeHtml(projectName)
  const number = escapeHtml(invoiceNumber)
  const amount = escapeHtml(amountLabel)
  const dueDate = escapeHtml(dueDateLabel)
  const href = escapeHtml(payUrl)

  const row = (label: string, value: string) => `
              <tr>
                <td style="padding:10px 0;color:#6a635a;font-size:14px;">${label}</td>
                <td style="padding:10px 0;text-align:right;color:#1b1916;font-size:14px;font-weight:600;">${value}</td>
              </tr>`

  const lead = isOverdue
    ? `Invoice <strong>${number}</strong> for <strong>${project}</strong> is past its due date.`
    : `A reminder that invoice <strong>${number}</strong> for <strong>${project}</strong> is${
        dueDateLabel ? ` due on <strong>${dueDate}</strong>` : ' awaiting payment'
      }.`

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center">

          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;">

            <tr>
              <td style="background:#e2661d;padding:28px 40px;">
                <h1 style="color:#ffffff;margin:0;font-size:22px;">${isOverdue ? 'Payment overdue' : 'Payment reminder'}</h1>
                <p style="color:#ffffff;opacity:.85;margin:6px 0 0;font-size:14px;">${org}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 40px;">

                <p style="margin:0 0 20px;color:#1b1916;font-size:15px;">${lead}</p>

                <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e9e4db;border-bottom:1px solid #e9e4db;margin-bottom:24px;">
                  ${row('Invoice', number)}
                  ${row('Project', project)}
                  ${row('Amount due', amount)}
                  ${dueDateLabel ? row('Due date', dueDate) : ''}
                </table>

                <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background:#e2661d;border-radius:8px;">
                      <a href="${href}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Pay invoice</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;color:#6a635a;font-size:14px;">
                  If you have already paid, you can ignore this message.
                </p>

              </td>
            </tr>

            <tr>
              <td style="padding:0 40px 32px;color:#9a9288;font-size:12px;">
                Sent by ${org} via Foxy HUB.
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  `
}
