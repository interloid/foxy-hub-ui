'use client'

import { LogTimeSheet } from '@/features/dashboard/components/sheets/log-time-sheet'
import * as React from 'react'
import { TimeTrackingHeader } from './time-tracking-header'

export function TimeTrackingSection() {
  const [isLogTimeOpen, setIsLogTimeOpen] = React.useState(false)

  return (
    <div className="space-y-6">
      <TimeTrackingHeader
        userName="Priya Nair"
        onLogTime={() => setIsLogTimeOpen(true)}
      />

      <LogTimeSheet open={isLogTimeOpen} onOpenChange={setIsLogTimeOpen} />
    </div>
  )
}
