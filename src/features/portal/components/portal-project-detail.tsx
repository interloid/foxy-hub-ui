'use client'

import { format, parseISO } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

import {
  FxTabsListUnderline,
  FxTabsTriggerUnderline,
} from '@/components/shared/fx-tabs'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import type { PortalInvoice, PortalTeamMember } from '@/features/portal/queries'
import { ProgressCard } from '@/features/projects/components/meta/progress-card'
import { MilestonesListCard } from '@/features/projects/components/milestones/milestones-list-card'
import { LatestUpdatesCard } from '@/features/projects/components/updates/latest-update-card'
import { PROJECT_STATUS_CONFIG } from '@/features/projects/constants'
import type {
  GetProjectDeliveriesResult,
  Project,
  ProjectStatus,
  ProjectUpdate,
} from '@/features/projects/types'
import type { MilestoneItem } from '@/features/projects/types/milestone'

import { PortalDeliverables } from './portal-deliverables'
import { PortalInvoicesCard } from './portal-invoices-card'
import {
  PortalHelpCard,
  PortalInvoicesSummary,
  PortalTeamCard,
} from './portal-sidebar-cards'

function formatDate(value?: string | null): string {
  if (!value) return '—'

  try {
    return format(parseISO(value), 'd MMM yyyy')
  } catch {
    return '—'
  }
}

function PortalProjectHeader({
  project,
  orgSlug,
}: {
  project: Project
  orgSlug: string
}) {
  const status =
    PROJECT_STATUS_CONFIG[project.status as ProjectStatus] ??
    PROJECT_STATUS_CONFIG.draft

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/portal/${orgSlug}`}
        className="text-muted-foreground hover:text-foreground duration-fast inline-flex w-fit items-center gap-1.5 text-[13px] transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        All projects
      </Link>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-foreground text-[22px] font-medium tracking-tight">
              {project.name}
            </h1>
            {/* Same pill the staff header draws — the config carries classes, not variants. */}
            <span
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${status.badgeClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
              {status.label}
            </span>
          </div>
          {project.description && (
            <p className="text-muted-foreground max-w-200 text-sm">
              {project.description}
            </p>
          )}
        </div>

        <dl className="flex shrink-0 items-center gap-6">
          <div>
            <dt className="text-muted-foreground text-xs">Started</dt>
            <dd className="text-foreground text-[13.5px] font-medium">
              {formatDate(project.startDate)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Due</dt>
            <dd className="text-foreground text-[13.5px] font-medium">
              {formatDate(project.dueDate)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

export function PortalProjectDetail({
  project,
  orgSlug,
  milestones,
  updates,
  deliveries,
  latestDeliveries,
  invoices,
  team,
  orgName,
}: {
  project: Project
  orgSlug: string
  milestones: MilestoneItem[]
  updates: ProjectUpdate[]
  deliveries: GetProjectDeliveriesResult
  latestDeliveries: GetProjectDeliveriesResult
  invoices: PortalInvoice[]
  team: PortalTeamMember[]
  orgName: string
}) {
  return (
    <main className="flex w-full flex-col gap-6 p-6">
      <PortalProjectHeader project={project} orgSlug={orgSlug} />

      <Tabs defaultValue="overview" className="w-full space-y-6">
        <div className="w-full scrollbar-none overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <FxTabsListUnderline
            aria-label="Project sections"
            className="w-full min-w-max"
          >
            <FxTabsTriggerUnderline value="overview" className="cursor-pointer">
              Overview
            </FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline
              value="deliverables"
              className="cursor-pointer"
            >
              Deliverables
            </FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline value="invoices" className="cursor-pointer">
              Invoices
            </FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline value="updates" className="cursor-pointer">
              Updates
            </FxTabsTriggerUnderline>
          </FxTabsListUnderline>
        </div>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr] xl:items-start">
            <div className="min-w-0 space-y-6">
              <ProgressCard milestones={milestones} />
              <MilestonesListCard milestones={milestones} />
              <LatestUpdatesCard
                updates={updates}
                projectId={project.id}
                isOverview
              />
              <PortalDeliverables
                deliveries={latestDeliveries.deliveries}
                orgSlug={orgSlug}
              />
            </div>

            <div className="min-w-0 space-y-6">
              <PortalInvoicesSummary
                invoices={invoices}
                projectName={project.name}
              />
              <PortalTeamCard team={team} orgName={orgName} />
              <PortalHelpCard orgName={orgName} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="deliverables">
          <PortalDeliverables
            deliveries={deliveries.deliveries}
            orgSlug={orgSlug}
            page={deliveries.page}
            pageSize={deliveries.pageSize}
            totalCount={deliveries.totalCount}
            totalPages={deliveries.totalPages}
            variant="full"
          />
        </TabsContent>

        <TabsContent value="invoices">
          <PortalInvoicesCard invoices={invoices} />
        </TabsContent>

        <TabsContent value="updates">
          <LatestUpdatesCard updates={updates} projectId={project.id} />
        </TabsContent>
      </Tabs>
    </main>
  )
}
