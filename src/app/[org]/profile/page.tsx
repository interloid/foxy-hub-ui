import { BackLink } from '@/components/shared/app/back-link'
import { ProfileCard } from '@/features/profile/components/profile-card'
import { PROFILE } from '@/features/profile/data'
import { getAccount } from '@/lib/dal'
import { ProfileCardSkeleton } from '@/skeleton/profile-card-skeleton'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: PROFILE.title,
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org } = await params

  return (
    <div className="mx-auto w-full max-w-160">
      <BackLink asChild className="mb-3.5">
        <Link href={`/${org}${PROFILE.back.href}`}>{PROFILE.back.label}</Link>
      </BackLink>
      <h1 className="mb-1 text-3xl font-semibold">{PROFILE.title}</h1>
      <p className="text-subtle-foreground mb-5.5 text-base">
        {PROFILE.subtitle}
      </p>

      <Suspense fallback={<ProfileCardSkeleton />}>
        <AsyncProfileCard org={org} />
      </Suspense>
    </div>
  )
}

async function AsyncProfileCard({ org }: { org: string }) {
  const account = await getAccount(org)
  if (!account) redirect('/sign-in?error=session_expired')

  return <ProfileCard account={account} />
}
