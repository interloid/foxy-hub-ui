import {
  FxTabsListUnderline,
  FxTabsTriggerUnderline,
} from '@/components/shared/fx-tabs'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { LatestUpdatesCard } from '@/features/projects/components/latest-update-card'
import { ProjectDetailHeader } from '@/features/projects/components/project-detail-header'
import { getProjectById, getProjectUpdates } from '@/features/projects/data'
import { notFound } from 'next/navigation'

interface ProjectDetailPageProps {
  params: Promise<{
    org: string
    id: string
  }>
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { org, id } = await params

  const [project, updates] = await Promise.all([
    getProjectById(org, id),
    getProjectUpdates(id),
  ])

  if (!project) {
    notFound()
  }

  return (
    <main className="ds:p-6 max-w-content mx-auto space-y-6">
      <ProjectDetailHeader project={project} />

      <Tabs defaultValue="overview" className="w-full space-y-6">
        <div className="w-full scrollbar-none overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <FxTabsListUnderline
            aria-label="Project Sections"
            className="w-full min-w-max"
          >
            <FxTabsTriggerUnderline value="overview">
              Overview
            </FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline value="milestones">
              Milestones
            </FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline value="hours">Hours</FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline value="updates">
              Updates
            </FxTabsTriggerUnderline>
            <FxTabsTriggerUnderline value="deliverables">
              Deliverables
            </FxTabsTriggerUnderline>
          </FxTabsListUnderline>{' '}
        </div>

        {/* Tab 1: Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <LatestUpdatesCard updates={updates} />
        </TabsContent>

        {/* Other Tab Placeholders */}
        <TabsContent value="milestones">
          <div className="border-border text-muted-foreground rounded-xl border p-6 text-xs">
            Milestones overview coming soon.
          </div>
        </TabsContent>

        <TabsContent value="hours">
          <div className="border-border text-muted-foreground rounded-xl border p-6 text-xs">
            Hours tracking overview coming soon.
          </div>
        </TabsContent>

        <TabsContent value="updates">
          <LatestUpdatesCard updates={updates} />
        </TabsContent>

        <TabsContent value="deliverables">
          <div className="border-border text-muted-foreground rounded-xl border p-6 text-xs">
            Deliverables section coming soon.
          </div>
        </TabsContent>
      </Tabs>
    </main>
  )
}
