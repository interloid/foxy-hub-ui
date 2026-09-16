'use client'

import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { LatestUpdatesCard } from '@/features/projects/components/updates/latest-update-card'
import { UpdatesInput } from '@/features/projects/components/updates/update-input'
import { initialsOf } from '@/lib/initials'
import { useState } from 'react'
import { toast } from 'sonner'
import { postUpdateAction } from '../../actions'
import type { CurrentUser, ProjectUpdate } from '../../types'

interface ProjectUpdatesSectionProps {
  projectId: string
  updates: ProjectUpdate[]
  user: CurrentUser | null
  isError?: boolean
}

export function ProjectUpdatesSection({
  projectId,
  updates,
  user,
  isError = false,
}: ProjectUpdatesSectionProps) {
  const [isPostingUpdate, setIsPostingUpdate] = useState(false)
  const { orgSlug } = useWorkspace()

  const handlePostUpdate = async (body: string) => {
    if (!user?.id || !projectId) {
      console.warn('Blocked by guard clause: Missing user ID or project ID')
      return
    }

    try {
      setIsPostingUpdate(true)
      await postUpdateAction(projectId, body, orgSlug)
      toast.success('Update added successfully!')
    } catch (error) {
      console.error('Failed to post project update:', error)
      toast.error('Failed to post project update')
    } finally {
      setIsPostingUpdate(false)
    }
  }

  return (
    <div className="grid gap-5">
      <UpdatesInput
        userInitials={initialsOf(user?.full_name ?? null, user?.email ?? null)}
        userAvatarUrl={user?.avatar_url}
        onSubmit={handlePostUpdate}
        isSubmitting={isPostingUpdate}
      />
      <LatestUpdatesCard
        updates={updates}
        projectId={projectId}
        isPostingUpdate={isPostingUpdate}
        isError={isError}
      />
    </div>
  )
}
