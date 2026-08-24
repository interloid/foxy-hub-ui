'use client'

import { FxButton } from '@/components/shared/fx-button'
import { Clock, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { LogTimeSheet } from '../sheets/log-time-sheet'
import { NewProjectSheet } from '../sheets/new-project-sheet' // 1. Import sheet
import { TimeGreeting } from './time-greetings'

interface DashboardHeadersProps {
  userName: string
  orgName?: string
  onDraftUpdateClick?: () => void
  onLogTimeClick?: () => void
  onNewProjectClick?: () => void
}

export function DashboardHeaders({
  userName,
  orgName = 'Interloid Studio',
  onDraftUpdateClick,
  onLogTimeClick,
  onNewProjectClick,
}: DashboardHeadersProps) {
  const [isLogTimeOpen, setIsLogTimeOpen] = useState(false)
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false) // 2. Add open state

  const handleLogTimeClick = () => {
    setIsLogTimeOpen(true)
    onLogTimeClick?.()
  }

  const handleNewProjectClick = () => {
    setIsNewProjectOpen(true) // 3. Open sheet on button click
    onNewProjectClick?.()
  }

  return (
    <>
      <div className="flex flex-col gap-4 md:p-3 lg:flex-row lg:items-end lg:justify-between">
        {/* Greeting and Subtitle */}
        <TimeGreeting userName={userName} />

        {/* Action Buttons Group */}
        <div className="grid grid-cols-[40%_25%_25%] gap-2.5 sm:flex sm:items-center sm:gap-3">
          {/* Draft Weekly Update */}
          <FxButton
            variant="secondary"
            onClick={onDraftUpdateClick}
            className="text-card-foreground border-border hover:bg-card hover:text-accent-foreground gap-2 text-[13px] font-medium"
          >
            <Sparkles
              className="text-primary shrink-0"
              width={10}
              height={10}
            />
            <span>Draft weekly update</span>
          </FxButton>

          {/* Log Time */}
          <FxButton
            variant="secondary"
            onClick={handleLogTimeClick}
            className="text-card-foreground border-border hover:bg-card hover:text-accent-foreground gap-2 text-[13px] font-medium"
          >
            <Clock className="text-primary shrink-0" width={10} height={10} />
            <span>Log time</span>
          </FxButton>

          {/* New Project (Primary CTA) */}
          <FxButton
            variant="default"
            onClick={handleNewProjectClick}
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-semibold"
          >
            <span>New project</span>
          </FxButton>
        </div>
      </div>
      {/* Sheets */}
      <LogTimeSheet open={isLogTimeOpen} onOpenChange={setIsLogTimeOpen} />
      <NewProjectSheet
        open={isNewProjectOpen}
        onOpenChange={setIsNewProjectOpen}
      />{' '}
      {/* 4. Render sheet */}
    </>
  )
}
