'use client'

import { FxButton } from '@/components/shared/fx-button'
import { Clock, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { UserRole } from '../../types'
import { LogTimeSheet } from '../sheets/log-time-sheet'
import { NewProjectSheet } from '../sheets/new-project-sheet'
import { TimeGreeting } from './time-greetings'

interface DashboardHeadersProps {
  userName: string
  orgName?: string
  role: UserRole
  onDraftUpdateClick?: () => void
  onLogTimeClick?: () => void
  onNewProjectClick?: () => void
}

export function DashboardHeaders({
  userName,
  orgName = 'Interloid Studio',
  role,
  onDraftUpdateClick,
  onLogTimeClick,
  onNewProjectClick,
}: DashboardHeadersProps) {
  const [isLogTimeOpen, setIsLogTimeOpen] = useState(false)
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false)

  const handleLogTimeClick = () => {
    setIsLogTimeOpen(true)
    onLogTimeClick?.()
  }

  const handleNewProjectClick = () => {
    setIsNewProjectOpen(true)
    onNewProjectClick?.()
  }

  return (
    <>
      <div className="flex flex-col gap-4 md:p-3 lg:flex-row lg:items-end lg:justify-between">
        {/* Greeting and Subtitle */}
        <TimeGreeting userName={userName} />

        {/* Action Buttons Group using Grid */}
        <div className="grid grid-cols-[40%_27%_27%] items-stretch gap-2 sm:flex sm:items-center sm:gap-3">
          {/* Draft Weekly Update */}
          <FxButton
            variant="secondary"
            onClick={onDraftUpdateClick}
            className="text-card-foreground compact:flex-row border-border hover:bg-card hover:text-accent-foreground flex h-auto flex-col justify-center gap-1.5 px-2 py-2 text-center text-[13px] font-medium whitespace-normal sm:h-9 sm:px-3 sm:whitespace-nowrap"
          >
            <Sparkles
              className="text-primary shrink-0"
              width={14}
              height={14}
            />
            <span className="leading-tight">Draft weekly update</span>
          </FxButton>

          {/* Log Time */}
          <FxButton
            variant="secondary"
            onClick={handleLogTimeClick}
            className="text-card-foreground compact:flex-row border-border hover:bg-card hover:text-accent-foreground flex h-auto flex-col justify-center gap-1.5 px-2 py-2 text-center text-[13px] font-medium whitespace-normal sm:h-9 sm:px-3 sm:whitespace-nowrap"
          >
            <Clock className="text-primary shrink-0" width={14} height={14} />
            <span className="leading-tight">Log time</span>
          </FxButton>

          {/* New Project (Primary CTA) */}
          <FxButton
            variant="default"
            onClick={handleNewProjectClick}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-auto justify-center px-2 py-2 text-center text-[13px] font-semibold whitespace-normal sm:h-9 sm:px-3 sm:whitespace-nowrap"
          >
            <span className="leading-tight">New project</span>
          </FxButton>
        </div>
      </div>

      {/* Sheets */}
      <LogTimeSheet open={isLogTimeOpen} onOpenChange={setIsLogTimeOpen} />
      {role === 'admin' ||
        (role === 'owner' && (
          <NewProjectSheet
            open={isNewProjectOpen}
            onOpenChange={setIsNewProjectOpen}
          />
        ))}
    </>
  )
}
