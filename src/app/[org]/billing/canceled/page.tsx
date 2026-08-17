import Link from 'next/link'

import { FxButton } from '@/components/shared/fx'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Checkout canceled',
  robots: { index: false },
}

export default function BillingCanceledPage() {
  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-6">
      <div className="border-border bg-card shadow-panel w-full max-w-110 rounded-2xl border p-7 text-center">
        <h1 className="mb-2 text-3xl leading-normal font-semibold">
          Checkout canceled
        </h1>
        <p className="text-md text-muted-foreground mb-6">
          Nothing was charged. Your workspace is ready on the free plan, and you
          can upgrade whenever you like.
        </p>
        <FxButton asChild size="block" className="rounded-lg">
          <Link href="/">Go to your dashboard</Link>
        </FxButton>
      </div>
    </div>
  )
}
