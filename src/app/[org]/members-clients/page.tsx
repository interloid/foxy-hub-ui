import type { Metadata } from 'next'

import { MembersClientsView } from '@/features/members-clients/components/members-clients-view'
import { getMembersClientsData } from '@/features/members-clients/queries'

interface MembersClientsPageProps {
  params: Promise<{ org: string }>
}

export async function generateMetadata({
  params,
}: MembersClientsPageProps): Promise<Metadata> {
  const { org } = await params

  return {
    title: 'Members & clients | Foxy Hub',
    description: `Manage team members and client access for ${org}`,
  }
}

export default async function MembersClientsPage({
  params,
}: MembersClientsPageProps) {
  const { org } = await params
  const data = await getMembersClientsData(org)

  return <MembersClientsView data={data} orgSlug={org} />
}
