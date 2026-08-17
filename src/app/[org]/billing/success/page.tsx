import { FxButton } from '@/components/shared/fx'
import { getSlug } from '@/features/auth/actions'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Payment received',
  robots: { index: false },
}

export default async function BillingSuccessPage() {
  const slugResult = await getSlug()

  const targetUrl =
    slugResult.ok && slugResult.slug ? `/${slugResult.slug}` : '/'

  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-6">
      <div className="border-border bg-card shadow-panel w-full max-w-110 rounded-2xl border p-7 text-center">
        <h1 className="mb-2 text-3xl leading-normal font-semibold">
          Payment received
        </h1>
        <p className="text-md text-muted-foreground mb-6">
          Your subscription is being activated. This can take a few seconds to
          appear.
        </p>
        <FxButton asChild size="block" className="rounded-lg">
          <Link href={targetUrl}>Go to your dashboard</Link>
        </FxButton>
      </div>
    </div>
  )
}
