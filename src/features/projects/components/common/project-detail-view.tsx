'use client'

import {
  FxTabsListUnderline,
  FxTabsTriggerUnderline,
} from '@/components/shared/fx-tabs'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useBreadcrumb } from '@/context/breadcrump'
import { ProjectDetailHeader } from '@/features/projects/components/common/project-detail-header'
import { LatestUpdatesCard } from '@/features/projects/components/updates/latest-update-card'
import { initialsOf } from '@/lib/initials'
import { useEffect, useState } from 'react'
import type {
  ClientItem,
  CurrentUser,
  DeliverableItem,
  HoursSummaryData,
  MilestoneItem,
  Project,
  ProjectAllocationItem,
  ProjectDelivery,
  ProjectUpdate,
} from '../../types'
import { DeliverablesSection } from '../deliverables/deliveries-card'
import { ClientCard } from '../meta/client-card'
import { EngagementCard } from '../meta/engagement-card'
import { ProjectInvoiceContext } from '../meta/new-invoice-sheet'
import { ProgressCard } from '../meta/progress-card'
import { MilestonesListCard } from '../milestones/milestones-list-card'
import { HoursBurnCard } from '../time-tracking/hours-burn-card'
import { HoursSummaryCards } from '../time-tracking/hours-summary-cards'
import {
  TimeEntriesTableCard,
  TimeEntryItem,
} from '../time-tracking/time-entries-card'
import { UpdatesInput } from '../updates/update-input'
import { postUpdateAction } from '../../actions'

interface ProjectDetailViewProps {
  project: Project
  invoiceProjects: ProjectInvoiceContext[]
  updates: ProjectUpdate[]
  deliverables: DeliverableItem[]
  milestones: MilestoneItem[]
  allocations: ProjectAllocationItem[]
  loggedHours: number
  client: ClientItem | null
  user: CurrentUser | null
  hoursSummary: HoursSummaryData
  timeEntries: TimeEntryItem[]
  deliveries: ProjectDelivery[]
  canManageAllocations?: boolean
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
  canManageAllocations = false,
}: ProjectDetailViewProps) {
  const [isPostingUpdate, setIsPostingUpdate] = useState(false)
  const { setProjectName } = useBreadcrumb()

  useEffect(() => {
    if (project?.name) {
      setProjectName(project.name)
    }
  }, [project?.name, setProjectName])

  const handlePostUpdate = async (body: string) => {
    if (!user || !user.id || !project.id) return

    try {
      setIsPostingUpdate(true)
      await postUpdateAction(project.id, user.id, body)
    } catch (error) {
      console.error('Failed to post project update:', error)
    } finally {
      setIsPostingUpdate(false)
    }
  }
  return (
    <main className="ds:p-6 min-w-full space-y-6">
      <ProjectDetailHeader
        project={project}
        invoiceProjects={invoiceProjects}
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
                updates={updates}
                projectId={project.id}
                isPostingUpdate={false}
              />
              <DeliverablesSection
                deliveries={deliveries}
                projectId={project.id}
                milestones={milestones}
                isOverview={true}
              />
            </div>

            {/* Right Column (Sidebar widgets) */}
            <div className="space-y-6">
              <ProgressCard milestones={milestones} />
              <EngagementCard
                allocations={allocations}
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
                allocations={allocations}
                projectEndDate={project.dueDate}
                loggedHours={loggedHours}
              />
              <MilestonesListCard milestones={milestones} />
              <ClientCard client={client} />
            </div>
          </div>
        </TabsContent>

        {/* Other Tab Placeholders */}
        <TabsContent value="milestones" className="2xl:mx-62.5">
          <MilestonesListCard
            milestones={milestones}
            isInOverview={false}
            projectId={project.id}
          />
        </TabsContent>

        <TabsContent value="hours" className="grid gap-5 2xl:mx-62.5">
          <HoursSummaryCards summary={hoursSummary} />
          <TimeEntriesTableCard entries={timeEntries} />
        </TabsContent>

        <TabsContent value="updates" className="grid gap-5 2xl:mx-62.5">
          <UpdatesInput
            userInitials={initialsOf(
              user?.full_name ?? null,
              user?.email ?? null
            )}
            userAvatarUrl={user?.avatar_url}
            onSubmit={handlePostUpdate}
            isSubmitting={isPostingUpdate}
          />
          <LatestUpdatesCard
            updates={updates}
            projectId={project.id}
            isPostingUpdate={true}
          />
        </TabsContent>

        <TabsContent value="deliveries" className="2xl:mx-62.5">
          <DeliverablesSection
            deliveries={deliveries}
            projectId={project.id}
            milestones={milestones}
          />
        </TabsContent>
      </Tabs>
    </main>
  )
}
