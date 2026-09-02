import { BackLink } from '@/components/shared/app/back-link'
import { ChangePasswordForm } from '@/features/auth/components/change-password-form'
import { CHANGE_PASSWORD } from '@/features/auth/data'
import { getAccount } from '@/lib/dal'
import { ChangePasswordSkeleton } from '@/skeleton/change-password'
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

      <Suspense fallback={<ChangePasswordSkeleton />}>
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
