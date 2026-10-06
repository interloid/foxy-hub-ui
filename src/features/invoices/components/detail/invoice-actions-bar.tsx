'use client'

import { Download, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import { FxConfirmDialog } from '@/components/shared/fx-confirm-dialog'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { isBillingRole } from '@/lib/role'

import { sendInvoiceReminderAction, voidInvoiceAction } from '../../actions'
import type { InvoiceDetail } from './types'

/** Send reminder / Download PDF / Void, under the client copy. */
export function InvoiceActionsBar({ invoice }: { invoice: InvoiceDetail }) {
  const { orgSlug, userRole } = useWorkspace()
  const [isReminding, startReminding] = useTransition()
  const [isVoiding, startVoiding] = useTransition()
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false)

  // Everything here is billing: primary admin and admin only, as on the list.
  if (!isBillingRole(userRole)) return null

  const canRemind = invoice.status === 'sent' || invoice.status === 'overdue'
  const canVoid =
    invoice.status === 'draft' ||
    invoice.status === 'sent' ||
    invoice.status === 'overdue'

  const remind = () =>
    startReminding(async () => {
      const res = await sendInvoiceReminderAction(orgSlug, invoice.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Reminder for ${invoice.number} sent to ${res.data.sentTo}`)
    })

  const voidInvoice = () =>
    startVoiding(async () => {
      const res = await voidInvoiceAction(orgSlug, invoice.id)
      setConfirmVoidOpen(false)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const { released } = res.data
      toast.success(
        released > 0
          ? `${invoice.number} voided - ${released} time ${released === 1 ? 'entry is' : 'entries are'} free to bill again`
          : `${invoice.number} voided`
      )
    })

  return (
    <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        {canRemind && (
          <FxButton
            type="button"
            variant="outline"
            disabled={isReminding}
            onClick={remind}
            className="gap-1.5"
          >
            {isReminding && <Loader2 className="size-3.5 animate-spin" />}
            {isReminding ? 'Sending...' : 'Send reminder'}
          </FxButton>
        )}
        <FxButton asChild variant="outline" className="gap-1.5">
          {/* A plain link: the route answers with `Content-Disposition: attachment`. */}
          <a href={`/${orgSlug}/invoices/${invoice.id}/pdf`} download>
            <Download className="size-4" />
            Download PDF
          </a>
        </FxButton>
      </div>

      {canVoid && (
        <FxButton
          type="button"
          variant="outline"
          className="text-muted-foreground"
          disabled={isVoiding}
          onClick={() => setConfirmVoidOpen(true)}
        >
          Void
        </FxButton>
      )}

      <FxConfirmDialog
        open={confirmVoidOpen}
        onOpenChange={(open) => {
          if (!isVoiding) setConfirmVoidOpen(open)
        }}
        title={`Void ${invoice.number}?`}
        description={
          invoice.invoiceUrl
            ? "The client's Stripe payment link stops working, the invoice is marked Cancelled, and the hours it billed can be invoiced again. This can't be undone."
            : "The invoice is marked Cancelled and the hours it billed can be invoiced again. This can't be undone."
        }
        confirmLabel="Void invoice"
        pendingLabel="Voiding..."
        isPending={isVoiding}
        onConfirm={voidInvoice}
      />
    </div>
  )
}
