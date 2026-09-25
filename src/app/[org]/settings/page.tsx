import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { SettingsView } from '@/features/settings/components/settings-view'
import { getMyDevices, getWorkspaceSettings } from '@/features/settings/queries'
import { getAccount } from '@/lib/dal'

interface SettingsPageProps {
  params: Promise<{ org: string }>
}

export async function generateMetadata({
  params,
}: SettingsPageProps): Promise<Metadata> {
  const { org } = await params

  return {
    title: 'Settings | Foxy Hub',
    description: `Workspace settings for ${org}`,
  }
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { org } = await params
  const [settings, account, devices] = await Promise.all([
    getWorkspaceSettings(org),
    getAccount(org),
    getMyDevices(),
  ])

  if (!account) redirect('/sign-in?error=session_expired')
  if (!settings) notFound()

  return (
    <SettingsView
      settings={settings}
      account={account}
      devices={devices}
      orgSlug={org}
    />
  )
}
