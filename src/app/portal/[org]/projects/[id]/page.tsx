import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PortalProjectDetail } from '@/features/portal/components/portal-project-detail'
import {
  getPortalProjectInvoices,
  getPortalProjectTeam,
} from '@/features/portal/queries'
import { getProjectDeliveries } from '@/features/projects/queries/get-deliverables'
import { getProjectMilestones } from '@/features/projects/queries/get-milestone'
import { getProjectById } from '@/features/projects/queries/get-projects'
import { getProjectUpdates } from '@/features/projects/queries/get-updates'
import { getAccount, getWorkspace } from '@/lib/dal'

const DELIVERIES_PAGE_SIZE = 5
const OVERVIEW_DELIVERIES_LIMIT = 5

interface PortalProjectPageProps {
  params: Promise<{ org: string; id: string }>
  searchParams: Promise<{ deliveriesPage?: string }>
}

export async function generateMetadata({
  params,
}: PortalProjectPageProps): Promise<Metadata> {
  const { org, id } = await params
  const project = await getProjectById(org, id)

  if (!project) return { title: 'Project not found | Foxy Hub' }

  return {
    title: `${project.name} | Foxy Hub`,
    description: project.description ?? `Project overview for ${project.name}`,
  }
}

export default async function PortalProjectPage({
  params,
  searchParams,
}: PortalProjectPageProps) {
  const { org, id } = await params
  const { deliveriesPage: rawPage } = await searchParams
  const deliveriesPage = Math.max(1, Number(rawPage) || 1)

  const project = await getProjectById(org, id)
  if (!project) notFound()

  const emptyDeliveries = {
    deliveries: [],
    totalCount: 0,
    page: deliveriesPage,
    pageSize: DELIVERIES_PAGE_SIZE,
    totalPages: 0,
  }

  const workspace = await getWorkspace(org)
  const account = await getAccount(org)

  const [milestones, updates, deliveries, latestDeliveries, invoices, team] =
    await Promise.all([
      getProjectMilestones(id).catch(() => []),
      getProjectUpdates(id).catch(() => []),
      getProjectDeliveries(id, deliveriesPage, DELIVERIES_PAGE_SIZE, [
        'submitted',
      ]).catch(() => emptyDeliveries),
      getProjectDeliveries(id, 1, OVERVIEW_DELIVERIES_LIMIT, [
        'submitted',
      ]).catch(() => ({
        ...emptyDeliveries,
        page: 1,
        pageSize: OVERVIEW_DELIVERIES_LIMIT,
      })),
      getPortalProjectInvoices(id),
      workspace ? getPortalProjectTeam(workspace.id) : [],
    ])

  return (
    <PortalProjectDetail
      project={project}
      orgSlug={org}
      milestones={milestones}
      updates={updates}
      deliveries={deliveries}
      latestDeliveries={latestDeliveries}
      invoices={invoices}
      team={team}
      orgName={workspace?.name ?? account?.orgName ?? org}
    />
  )
}
