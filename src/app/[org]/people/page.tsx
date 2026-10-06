import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MembersClientsView } from '@/features/people/components/members-clients-view'
import { canViewPeople } from '@/features/people/lib/can-view-people'
import { getMembersClientsData } from '@/features/people/queries'
import { getAccount, getWorkspace } from '@/lib/dal'

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

  // The sidebar hides People from contributors, but a hidden link is not a locked door:
  // check the role here, before any member data is loaded. 404 rather than "denied", so
  // the page does not confirm it exists.
  const workspace = await getWorkspace(org)
  if (!workspace || !canViewPeople(workspace.role)) notFound()

  const account = await getAccount(org)
  const data = await getMembersClientsData(org)

  return <MembersClientsView data={data} orgSlug={org} account={account} />
}
