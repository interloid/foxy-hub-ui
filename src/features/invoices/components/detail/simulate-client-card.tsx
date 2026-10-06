'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'

import { PayAsClientDialog } from './pay-as-client-dialog'
import type { InvoiceDetail } from './types'

/**
 * Lets staff watch a payment land without a client: opens the Stripe-hosted page in a new
 * tab, and the dialog waits for the webhook to flip the invoice to Paid.
 */
export function SimulateClientCard({ invoice }: { invoice: InvoiceDetail }) {
  const [open, setOpen] = useState(false)

  return (
    <section
      aria-labelledby="simulate-client-heading"
      className="bg-card border-border space-y-1 rounded-xl border p-5 shadow-xs"
    >
      <h2
        id="simulate-client-heading"
        className="text-foreground text-[14px] font-semibold"
      >
        Simulate the client
      </h2>
      <p className="text-muted-foreground text-[12.5px]">
        Opens the Stripe-hosted checkout the client would see, so you can watch
        the status flip.
      </p>
      <div className="pt-3">
        <FxButton
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            if (!invoice.invoiceUrl) {
              toast.info(
                'This invoice has no Stripe payment link yet - it is created when the invoice is issued.'
              )
              return
            }
            window.open(invoice.invoiceUrl, '_blank', 'noopener,noreferrer')
            setOpen(true)
          }}
        >
          Pay as client
        </FxButton>
      </div>

      <PayAsClientDialog invoice={invoice} open={open} onOpenChange={setOpen} />
    </section>
  )
}
