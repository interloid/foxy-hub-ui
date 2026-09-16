'use client'

import { LogTimeSheet } from '@/features/dashboard/components/sheets/log-time-sheet'
import * as React from 'react'
import { TimeTrackingHeader } from './time-tracking-header'

interface TimeTrackingSectionProps {
  userName?: string
}
export function TimeTrackingSection({ userName }: TimeTrackingSectionProps) {
  const [isLogTimeOpen, setIsLogTimeOpen] = React.useState(false)

  return (
    <div className="space-y-6">
      <TimeTrackingHeader
        userName={userName}
        onLogTime={() => setIsLogTimeOpen(true)}
      />

      <LogTimeSheet open={isLogTimeOpen} onOpenChange={setIsLogTimeOpen} />
    </div>
  )
}
