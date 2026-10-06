import { BackLink } from '@/components/shared/app/back-link'
import { EmailChangeBanner } from '@/features/profile/components/email-change-banner'
import { ProfileCard } from '@/features/profile/components/profile-card'
import { RoleAccessCard } from '@/features/profile/components/role-access-card'
import { PROFILE } from '@/features/profile/data'
import { getAccount } from '@/lib/dal'
import { ProfileCardSkeleton } from '@/skeleton/profile-card'
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
    <div className="w-full md:p-6">
      <BackLink asChild className="mb-3.5">
        <Link href={`/${org}${PROFILE.back.href}`}>{PROFILE.back.label}</Link>
      </BackLink>
      <h1 className="mb-1 text-3xl font-semibold">{PROFILE.title}</h1>
      <p className="text-subtle-foreground mb-5.5 text-base">
        {PROFILE.subtitle}
      </p>

      <Suspense fallback={null}>
        <EmailChangeBanner />
      </Suspense>

      <div className="grid items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Suspense fallback={<ProfileCardSkeleton />}>
          <AsyncProfileCard org={org} />
        </Suspense>
      </div>
    </div>
  )
}

async function AsyncProfileCard({ org }: { org: string }) {
  const account = await getAccount(org)
  if (!account) redirect('/sign-in?error=session_expired')

  return (
    <>
      <ProfileCard account={account} />
      <RoleAccessCard role={account.role} orgName={account.orgName} />
    </>
  )
}
