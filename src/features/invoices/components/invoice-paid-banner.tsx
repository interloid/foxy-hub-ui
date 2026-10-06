'use client'

import { CheckCircle2, X, XCircle } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'

export function InvoicePaidBanner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const payment = searchParams.get('payment')
  if (payment !== 'success' && payment !== 'cancelled') return null

  const succeeded = payment === 'success'

  const dismiss = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('payment')
    params.delete('session_id')

    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4',
        succeeded
          ? 'border-success/20 bg-success/10'
          : 'border-border bg-muted/40'
      )}
    >
      {succeeded ? (
        <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" />
      ) : (
        <XCircle className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-foreground text-[13.5px] font-semibold">
          {succeeded ? 'Payment received' : 'Payment cancelled'}
        </p>
        <p className="text-muted-foreground text-[12.5px]">
          {succeeded
            ? 'The invoice will show as paid here once Stripe confirms it, usually within a few seconds.'
            : 'Nothing was charged.'}
        </p>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded-md p-0.5 transition-colors"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
