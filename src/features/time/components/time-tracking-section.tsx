'use client'

import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { useRouter } from 'next/navigation'
import { TimeTrackingHeader } from './time-tracking-header'

interface TimeTrackingSectionProps {
  userName?: string
}
export function TimeTrackingSection({ userName }: TimeTrackingSectionProps) {
  const router = useRouter()
  const { orgSlug } = useWorkspace()

  return (
    <div className="space-y-6">
      <TimeTrackingHeader
        userName={userName}
        // Logging time has its own page now.
        onLogTime={() => router.push(`/${orgSlug}/time/log`)}
      />
    </div>
  )
}
