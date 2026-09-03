import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { Sparkles } from 'lucide-react'
import type { Project } from '../types'

interface ProjectDetailHeaderProps {
  project: Project
}

export function ProjectDetailHeader({ project }: ProjectDetailHeaderProps) {
  const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(project.contractValue ?? project.retainerAmount ?? 0)

  const clientInitials = project.clientName
    ? project.clientName.substring(0, 2).toUpperCase()
    : 'NW'

  return (
    <header className="ds:items-between ds:justify-between flex flex-col gap-4 md:flex-row md:justify-between">
      {/* Left Metadata Group */}
      <div className="space-y-2">
        {/* Title + Status Badge */}
        <div className="items- flex items-center gap-3">
          <h1 className="text-foreground ds:text-2xl min-w-0 text-[22px] font-bold tracking-tight">
            {project.name}
          </h1>

          <FxBadge
            variant="info"
            className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]"
          >
            <span
              className="bg-info h-1.5 w-1.5 rounded-full"
              aria-hidden="true"
            />
            <span className="capitalize">{project.status}</span>
          </FxBadge>
        </div>

        {/* Sub-line Details (Client, Contract, Milestones) */}
        <div className="grid w-full grid-cols-3 gap-4 text-[13px]">
          {/* Client Info */}
          <div className="flex min-w-0 items-center gap-2">
            <div
              aria-hidden="true"
              className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold select-none"
            >
              {clientInitials}
            </div>
            <span className="text-muted-foreground min-w-0 font-medium wrap-break-word">
              {project.clientName}
            </span>
          </div>

          {/* Contract / Budget */}
          <div className="flex min-w-0 flex-col items-center gap-1 text-center md:flex-row md:items-center">
            <span className="text-muted-foreground">Contract</span>
            <span className="text-foreground">{formattedValue}</span>
          </div>

          {/* Milestones Counter */}
          <div className="flex min-w-0 flex-col items-start justify-around gap-1 text-right md:flex-row md:items-center">
            <span className="text-foreground font-medium">2/5</span>
            <span className="text-muted-foreground">milestones</span>
          </div>
        </div>
      </div>

      {/* Action Buttons: Full width on 375px mobile, aligned right on 768px/1280px */}
      <nav
        aria-label="Project actions"
        className="ds:pt-0 flex items-start gap-3"
      >
        <FxButton
          variant="secondary"
          className="text-card-foreground border-border hover:bg-card hover:text-accent-foreground flex h-auto justify-center gap-1.5 px-3 py-2 text-center text-[13px] font-medium whitespace-normal sm:h-9 sm:whitespace-nowrap"
        >
          <Sparkles className="text-primary shrink-0" width={14} height={14} />
          <span className="leading-tight">Draft update</span>
        </FxButton>
        <FxButton
          variant="default"
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-auto justify-center px-3 py-2 text-center text-[13px] font-semibold whitespace-normal sm:h-9 sm:whitespace-nowrap"
        >
          <span className="leading-tight">New Invoice</span>
        </FxButton>
      </nav>
    </header>
  )
}
