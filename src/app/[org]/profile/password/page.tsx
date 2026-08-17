import { AppShell } from '@/components/layout/app-shell'
import { BackLink } from '@/components/shared/app/back-link'
import { getFooter, getNavSections, WORKSPACE } from '@/config/nav'
import { ChangePasswordForm } from '@/features/auth/components/change-password-form'
import { CHANGE_PASSWORD } from '@/features/auth/data'
import { PROFILE } from '@/features/profile/data'
import { getAccount } from '@/lib/dal'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

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
  const account = await getAccount(org)
  if (!account) redirect('/sign-in?error=session_expired')

  return (
    <AppShell
      sections={getNavSections(org)}
      activeHref={`/${org}/profile`}
      workspace={WORKSPACE}
      account={{
        name: account.fullName ?? PROFILE.noName,
        email: account.email ?? '',
        role: account.role ?? '',
        initials: account.initials,
      }}
      breadcrumb={CHANGE_PASSWORD.title}
      footer={getFooter(org)}
    >
      <div className="mx-auto w-full max-w-130">
        <BackLink asChild className="mb-3.5">
          <Link href={CHANGE_PASSWORD.back.href}>
            {CHANGE_PASSWORD.back.label}
          </Link>
        </BackLink>
        <h1 className="mb-1 text-3xl font-semibold">{CHANGE_PASSWORD.title}</h1>
        <p className="text-md text-muted-foreground mb-5.5">
          {CHANGE_PASSWORD.subtitle}
        </p>
        <ChangePasswordForm />
      </div>
    </AppShell>
  )
}
