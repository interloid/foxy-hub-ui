import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AiUpdateView } from '@/features/ai-updates/components/ai-update-view'
import { MOCK_AI_UPDATE_PROJECTS } from '@/features/ai-updates/mock-data'
import { getWorkspace } from '@/lib/dal'
import { isProjectOwnerRole } from '@/lib/role'

export const metadata: Metadata = {
  title: 'AI updates | Foxy Hub',
}

interface AiUpdatesPageProps {
  params: Promise<{ org: string }>
}

export default async function AiUpdatesPage({ params }: AiUpdatesPageProps) {
  const { org } = await params

  // Primary admin, admin and manager - the people who send clients updates. The sidebar
  // hides the link from contributors; this keeps a typed-in URL out too.
  const workspace = await getWorkspace(org)
  if (!workspace || !isProjectOwnerRole(workspace.role)) notFound()

  // MOCK - swap for the workspace's active projects and their week of activity.
  return (
    <div className="ds:p-6">
      <AiUpdateView projects={MOCK_AI_UPDATE_PROJECTS} />
    </div>
  )
}
