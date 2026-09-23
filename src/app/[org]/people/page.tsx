import type { Metadata } from 'next'

import { MembersClientsView } from '@/features/people/components/members-clients-view'
import { getMembersClientsData } from '@/features/people/queries'
import { getAccount } from '@/lib/dal'

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
  const account = await getAccount(org)
  const data = await getMembersClientsData(org)

  return <MembersClientsView data={data} orgSlug={org} account={account} />
}
