import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FxButton } from '@/components/shared/fx'
import { verifySession } from '@/lib/dal'
import {
  redeemPendingInvites,
  startPlanCheckout,
} from '@/features/onboarding/actions'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Finishing setup',
  robots: { index: false, follow: false },
}

export default async function OnboardCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; cycle?: string }>
}) {
  const params = await searchParams

  const session = await verifySession()
  if (!session) redirect('/sign-in?error=session_expired')

  const invites = await redeemPendingInvites()
  if (!invites.ok) console.error('invite redemption failed:', invites.error)
  const emailed = invites.ok ? invites.data.emailed : 0
  const failed = invites.ok ? invites.data.failed : []

  const planName = params.plan?.trim()
  const cycle = params.cycle === 'yearly' ? 'yearly' : 'monthly'

  if (!planName) redirect('/')

  const result = await startPlanCheckout(planName, cycle)

  if (result.ok && result.data.url) redirect(result.data.url)

  const message = result.ok
    ? (result.data.message ?? 'Your workspace is ready.')
    : result.error

  const sentNote =
    emailed > 0
      ? `Invited ${emailed} teammate${emailed === 1 ? '' : 's'}.`
      : null
  const failedNote =
    failed.length > 0
      ? `Could not invite: ${failed.join(', ')}. You can retry from Settings.`
      : null

  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-6">
      <div className="border-border bg-card shadow-panel w-full max-w-110 rounded-2xl border p-7 text-center">
        <h1 className="mb-2 text-3xl leading-normal font-semibold">
          Workspace created
        </h1>
        <p className="text-md text-muted-foreground mb-2">{message}</p>
        {sentNote ? (
          <p className="text-success mb-2 text-sm">{sentNote}</p>
        ) : null}
        {failedNote ? (
          <p className="text-destructive mb-2 text-sm">{failedNote}</p>
        ) : null}
        <div className="mb-6" />
        <FxButton asChild size="block" className="rounded-lg">
          <Link href="/">Go to your dashboard</Link>
        </FxButton>
      </div>
    </div>
  )
}
