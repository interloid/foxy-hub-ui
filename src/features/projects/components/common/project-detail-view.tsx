import {
  FxTabsListUnderline,
  FxTabsTriggerUnderline,
} from '@/components/shared/fx-tabs'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ProjectDetailHeader } from '@/features/projects/components/common/project-detail-header'
import { LatestUpdatesCard } from '@/features/projects/components/updates/latest-update-card'
import type {
  ClientItem,
  CurrentUser,
  DeliverableItem,
  GetProjectDeliveriesResult,
  HoursSummaryData,
  MilestoneItem,
  Project,
  ProjectAllocationItem,
  ProjectUpdate,
} from '../../types'
import { ProjectInvoiceContext } from '../../types/invoice'
import { TimeEntryItem } from '../../types/time-entries'
import { DeliverablesSection } from '../deliverables/deliveries-card'
import { ClientCard } from '../meta/client-card'
import { EngagementCard } from '../meta/engagement-card'
import { ProgressCard } from '../meta/progress-card'
import { MilestonesListCard } from '../milestones/milestones-list-card'
import { HoursBurnCard } from '../time-tracking/hours-burn-card'
import { HoursSummaryCards } from '../time-tracking/hours-summary-cards'
import { TimeEntriesTableCard } from '../time-tracking/time-entries-card'
import { ProjectUpdatesSection } from '../updates/project-updates-section'
import { ProjectBreadcrumbSetter } from './project-breadcrump-setter'

type QueryResult<T> = {
  data: T
  isError: boolean
}

interface ProjectDetailViewProps {
  project: Project
  invoiceProjects: QueryResult<ProjectInvoiceContext[]>
  updates: QueryResult<ProjectUpdate[]>
  deliverables: QueryResult<DeliverableItem[]>
  milestones: QueryResult<MilestoneItem[]>
  allocations: QueryResult<ProjectAllocationItem[]>
  loggedHours: QueryResult<number>
  client: QueryResult<ClientItem | null>
  user: QueryResult<CurrentUser | null>
  hoursSummary: QueryResult<HoursSummaryData>
  timeEntries: QueryResult<TimeEntryItem[]>
  deliveries: QueryResult<GetProjectDeliveriesResult>
  latestDeliveries: QueryResult<GetProjectDeliveriesResult>
  canManageAllocations?: boolean
  hasExistingInvoice?: boolean
}

export function ProjectDetailView({
  project,
  invoiceProjects,
  updates,
  milestones,
  allocations,
  loggedHours,
  client,
  user,
  hoursSummary,
  timeEntries,
  deliveries,
  latestDeliveries,
  canManageAllocations = false,
  hasExistingInvoice,
}: ProjectDetailViewProps) {
  return (
    <main className="ds:p-6 min-w-full space-y-6">
      <ProjectBreadcrumbSetter name={project?.name} />

      <ProjectDetailHeader
        project={project}
        invoiceProjects={invoiceProjects.data}
        isInvoiceError={invoiceProjects.isError}
        hasExistingInvoice={hasExistingInvoice}
      />

      <Tabs defaultValue="overview" className="w-full space-y-6">
        <div className="w-full scrollbar-none overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <FxTabsListUnderline
            aria-label="Project Sections"
            className="w-full min-w-max"
          >
            <FxTabsTriggerUnderline value="overview" className="cursor-pointer">
              Overview
            </FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline
              value="milestones"
              className="cursor-pointer"
            >
              Milestones
            </FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline value="hours" className="cursor-pointer">
              Hours
            </FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline value="updates" className="cursor-pointer">
              Updates
            </FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline
              value="deliveries"
              className="cursor-pointer"
            >
              Deliveries
            </FxTabsTriggerUnderline>
          </FxTabsListUnderline>
        </div>

        {/* Tab 1: Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr] xl:items-start">
            {/* Left Column (Main content) */}
            <div className="space-y-6">
              <LatestUpdatesCard
                updates={updates.data}
                isError={updates.isError}
                projectId={project.id}
                isPostingUpdate={false}
              />
              <DeliverablesSection
                deliveries={latestDeliveries.data.deliveries}
                isError={latestDeliveries.isError}
                projectId={project.id}
                milestones={milestones.data}
                isOverview={true}
              />
            </div>

            {/* Right Column (Sidebar widgets) */}
            <div className="space-y-6">
              <ProgressCard
                milestones={milestones.data}
                isError={milestones.isError}
              />
              <EngagementCard
                allocations={allocations.data}
                isError={allocations.isError}
                engagementModel={project.engagement}
                projectId={project.id}
                canManage={canManageAllocations}
                retainerBucketHours={project.retainerHours}
                retainerPeriod={project.retainerPeriod}
                retainerFee={project.retainerAmount}
                overageMultiplier={project.retainerOverage}
                fixedPriceFee={project.contractValue}
              />
              <HoursBurnCard
                allocations={allocations.data}
                isError={allocations.isError || loggedHours.isError}
                projectEndDate={project.dueDate}
                loggedHours={loggedHours.data}
              />
              <MilestonesListCard
                milestones={milestones.data}
                isError={milestones.isError}
              />
              <ClientCard client={client.data} isError={client.isError} />
            </div>
          </div>
        </TabsContent>

        {/* Other Tab Content */}
        <TabsContent value="milestones">
          <MilestonesListCard
            milestones={milestones.data}
            isError={milestones.isError}
            isInOverview={false}
            projectId={project.id}
          />
        </TabsContent>

        <TabsContent value="hours" className="grid gap-5">
          <HoursSummaryCards
            summary={hoursSummary.data}
            isError={hoursSummary.isError}
          />
          <TimeEntriesTableCard
            entries={timeEntries.data}
            isError={timeEntries.isError}
          />
        </TabsContent>

        <TabsContent value="updates">
          <ProjectUpdatesSection
            projectId={project.id}
            updates={updates.data}
            isError={updates.isError}
            user={user.data}
          />
        </TabsContent>

        <TabsContent value="deliveries">
          <DeliverablesSection
            deliveries={deliveries.data.deliveries}
            isError={deliveries.isError}
            projectId={project.id}
            milestones={milestones.data}
            page={deliveries.data.page}
            pageSize={deliveries.data.pageSize}
            totalCount={deliveries.data.totalCount}
            totalPages={deliveries.data.totalPages}
          />
        </TabsContent>
      </Tabs>
    </main>
  )
}
