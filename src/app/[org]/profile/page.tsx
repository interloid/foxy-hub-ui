import { AppShell } from '@/components/layout/app-shell'
import { BackLink } from '@/components/shared/app/back-link'
import { getFooter, getNavSections, WORKSPACE } from '@/config/nav'
import { ProfileCard } from '@/features/profile/components/profile-card'
import { PROFILE } from '@/features/profile/data'
import { getAccount } from '@/lib/dal'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Profile',
  robots: { index: false, follow: false },
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org } = await params
  const account = await getAccount(org)
  if (!account) redirect('/sign-in?error=session_expired')

  return (
    <AppShell
      sections={getNavSections(org)}
      activeHref={`/${org}/profile`}
      workspace={{
        name: account.orgName ?? WORKSPACE.name,
        org,
      }}
      account={{
        name: account.fullName ?? PROFILE.noName,
        email: account.email ?? '',
        role: account.role ?? '',
        initials: account.initials,
        org,
      }}
      breadcrumb={PROFILE.title}
      footer={getFooter(org)}
    >
      <div className="mx-auto w-full max-w-130">
        <BackLink asChild className="mb-3.5">
          <Link href={PROFILE.back.href}>{PROFILE.back.label}</Link>
        </BackLink>
        <h1 className="mb-1 text-3xl font-semibold">{PROFILE.title}</h1>
        <p className="text-md text-muted-foreground mb-5.5">
          {PROFILE.subtitle}
        </p>
        <ProfileCard account={account} />
      </div>
    </AppShell>
  )
}
