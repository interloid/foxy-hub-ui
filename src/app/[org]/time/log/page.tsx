import { LogTimeView } from '@/features/time/components/log-time/log-time-view'
import { getLogTimePageData } from '@/features/time/queries/get-log-time-data'
import { getWorkspace } from '@/lib/dal'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

interface LogTimePageProps {
  params: Promise<{
    org: string
  }>
}

export const metadata: Metadata = {
  title: 'Log time | Foxy Hub',
}

export default async function LogTimePage({ params }: LogTimePageProps) {
  const { org } = await params

  const workspace = await getWorkspace(org)
  if (!workspace) notFound()

  const data = await getLogTimePageData(workspace)
  if (!data) redirect('/sign-in')

  return <LogTimeView orgSlug={org} data={data} />
}
