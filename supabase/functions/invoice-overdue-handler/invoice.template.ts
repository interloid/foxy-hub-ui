/**
 * Overdue-invoice notice.
 *
 * Takes the invoice itself, not just a project name. The previous version rendered only
 * "your invoice for <project> is overdue" — no number, no amount, no due date — which left
 * the recipient nothing to act on and no way to tell two overdue invoices apart.
 *
 * Colours are raw hex on purpose. Mail clients strip `<style>` and do not support CSS custom
 * properties, so the design tokens in `src/app/globals.css` cannot reach here; inline hex is
 * the only thing that renders. The values are the brand's `--primary` (#e2661d) and the
 * neutral ramp, kept in step with the product by hand.
 */

/** Escapes text before it reaches the HTML body — org and project names are user-supplied. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type OverdueInvoiceEmail = {
  orgName: string;
  projectName: string;
  invoiceNumber: string;
  /** Pre-formatted for the invoice's own currency, e.g. "₹12,500.00". */
  amountLabel: string;
  /** Pre-formatted, e.g. "3 August 2026". Empty when the invoice carries no due date. */
  dueDateLabel: string;
};

export function overdueInvoiceTemplate({
  orgName,
  projectName,
  invoiceNumber,
  amountLabel,
  dueDateLabel,
}: OverdueInvoiceEmail) {
  const org = escapeHtml(orgName);
  const project = escapeHtml(projectName);
  const number = escapeHtml(invoiceNumber);
  const amount = escapeHtml(amountLabel);
  const dueDate = escapeHtml(dueDateLabel);

  const row = (label: string, value: string) => `
              <tr>
                <td style="padding:10px 0;color:#6a635a;font-size:14px;">${label}</td>
                <td style="padding:10px 0;text-align:right;color:#1b1916;font-size:14px;font-weight:600;">${value}</td>
              </tr>`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center">

          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;">

            <tr>
              <td style="background:#e2661d;padding:28px 40px;">
                <h1 style="color:#ffffff;margin:0;font-size:22px;">Invoice overdue</h1>
                <p style="color:#ffffff;opacity:.85;margin:6px 0 0;font-size:14px;">${org}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 40px;">

                <p style="margin:0 0 20px;color:#1b1916;font-size:15px;">
                  Invoice <strong>${number}</strong> for
                  <strong>${project}</strong> is now past its due date.
                </p>

                <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e9e4db;border-bottom:1px solid #e9e4db;margin-bottom:24px;">
                  ${row("Invoice", number)}
                  ${row("Project", project)}
                  ${row("Amount due", amount)}
                  ${dueDateLabel ? row("Due date", dueDate) : ""}
                </table>

                <p style="margin:0;color:#6a635a;font-size:14px;">
                  Please complete the payment at your earliest convenience. If you have
                  already paid, you can ignore this message.
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
  `;
}
