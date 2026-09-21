import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SettingsView } from '@/features/settings/components/settings-view'
import { getWorkspaceSettings } from '@/features/settings/queries'

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
  const settings = await getWorkspaceSettings(org)

  if (!settings) notFound()

  return <SettingsView settings={settings} orgSlug={org} />
}
