import { BackLink } from '@/components/shared/app/back-link'
import { FxCard } from '@/components/shared/fx-card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChangePasswordForm } from '@/features/auth/components/change-password-form'
import { CHANGE_PASSWORD } from '@/features/auth/data'
import { getAccount } from '@/lib/dal'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: 'Change password',
  robots: { index: false, follow: false },
}

export default async function ChangePasswordPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org } = await params

  return (
    <div className="mx-auto w-full max-w-130">
      <BackLink asChild className="mb-3.5">
        <Link href={`/${org}/profile`}>{CHANGE_PASSWORD.back.label}</Link>
      </BackLink>
      <h1 className="mb-1 text-3xl font-semibold">{CHANGE_PASSWORD.title}</h1>
      <p className="text-md text-muted-foreground mb-5.5">
        {CHANGE_PASSWORD.subtitle}
      </p>

      <Suspense fallback={<ChangePasswordFormSkeleton />}>
        <AsyncChangePasswordForm org={org} />
      </Suspense>
    </div>
  )
}

async function AsyncChangePasswordForm({ org }: { org: string }) {
  const account = await getAccount(org)
  if (!account) redirect('/sign-in?error=session_expired')

  return <ChangePasswordForm org={org} />
}

export function ChangePasswordFormSkeleton() {
  return (
    <FxCard>
      {' '}
      <div className="border-border space-y-4 rounded-xl border p-5">
        <div className="space-y-2">
          <Skeleton className="bg-muted dark:bg-muted h-4 w-28" />
          <Skeleton className="bg-muted dark:bg-muted h-9 w-full rounded-md" />
        </div>
        <div className="space-y-2">
          <Skeleton className="bg-muted dark:bg-muted h-4 w-24" />
          <Skeleton className="bg-muted dark:bg-muted h-9 w-full rounded-md" />
        </div>
        <div className="space-y-2">
          <Skeleton className="bg-muted dark:bg-muted h-4 w-32" />
          <Skeleton className="bg-muted dark:bg-muted h-9 w-full rounded-md" />
        </div>
        <div className="mt-1 flex justify-end gap-2 pt-2">
          <Skeleton className="bg-muted dark:bg-muted h-9 w-20 rounded-md" />
          <Skeleton className="bg-muted dark:bg-muted h-9 w-28 rounded-md" />
        </div>
      </div>
    </FxCard>
  )
}
