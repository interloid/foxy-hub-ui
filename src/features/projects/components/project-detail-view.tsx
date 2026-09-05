'use client'

import {
  FxTabsListUnderline,
  FxTabsTriggerUnderline,
} from '@/components/shared/fx-tabs'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { DeliverablesCard } from '@/features/projects/components/deliverables-card'
import { LatestUpdatesCard } from '@/features/projects/components/latest-update-card'
import { ProjectDetailHeader } from '@/features/projects/components/project-detail-header'
import { initialsOf } from '@/lib/initials'
import { useState } from 'react'
import { postUpdateAction } from '../actions'
import type {
  ClientItem,
  CurrentUser,
  DeliverableItem,
  HoursSummaryData,
  MilestoneItem,
  Project,
  ProjectAllocationItem,
  ProjectUpdate,
} from '../types'
import { ClientCard } from './client-card'
import { EngagementCard } from './engagement-card'
import { HoursBurnCard } from './hours-burn-card'
import { HoursSummaryCards } from './hours-summary-cards'
import { MilestonesListCard } from './milestones-list-card'
import { ProgressCard } from './progress-card'
import { TimeEntriesTableCard, TimeEntryItem } from './time-entries-card'
import { UpdatesInput } from './update-input'

interface ProjectDetailViewProps {
  project: Project
  updates: ProjectUpdate[]
  deliverables: DeliverableItem[]
  milestones: MilestoneItem[]
  allocations: ProjectAllocationItem[]
  loggedHours: number
  client: ClientItem | null
  user: CurrentUser | null
  hoursSummary: HoursSummaryData
  timeEntries: TimeEntryItem[]
}

export function ProjectDetailView({
  project,
  updates,
  deliverables,
  milestones,
  allocations,
  loggedHours,
  client,
  user,
  hoursSummary,
  timeEntries,
}: ProjectDetailViewProps) {
  const [isPostingUpdate, setIsPostingUpdate] = useState(false)

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
      <ProjectDetailHeader project={project} />

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
              value="deliverables"
              className="cursor-pointer"
            >
              Deliverables
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
              <DeliverablesCard deliverables={deliverables} />
            </div>

            {/* Right Column (Sidebar widgets) */}
            <div className="space-y-6">
              <ProgressCard milestones={milestones} />
              <EngagementCard
                allocations={allocations}
                engagementModel={project.engagement}
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
        <TabsContent value="milestones">
          <MilestonesListCard milestones={milestones} isInOverview={false} />
        </TabsContent>

        <TabsContent value="hours" className="grid gap-5">
          <HoursSummaryCards summary={hoursSummary} />
          <TimeEntriesTableCard entries={timeEntries} />
        </TabsContent>

        <TabsContent value="updates" className="grid gap-5">
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

        {/* Tab 5: Deliverables Tab */}
        <TabsContent value="deliverables">
          <DeliverablesCard deliverables={deliverables} />
        </TabsContent>
      </Tabs>
    </main>
  )
}
