'use client'

import { Sparkles } from 'lucide-react'
import * as React from 'react'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'

import { PROJECT_STATUS_CONFIG } from '../constants'
import type { Project, ProjectStatus } from '../types'
import { NewInvoiceSheet, ProjectInvoiceContext } from './new-invoice-sheet'

interface ProjectDetailHeaderProps {
  project: Project
  invoiceProjects?: ProjectInvoiceContext[]
}

export function ProjectDetailHeader({
  project,
  invoiceProjects = [],
}: ProjectDetailHeaderProps) {
  const [isInvoiceSheetOpen, setIsInvoiceSheetOpen] = React.useState(false)
  const [isSubmittingInvoice, setIsSubmittingInvoice] = React.useState(false)

  const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(project.contractValue ?? project.retainerAmount ?? 0)

  const clientInitials = project.clientName
    ? project.clientName.substring(0, 2).toUpperCase()
    : 'NW'

  const config =
    PROJECT_STATUS_CONFIG[project.status as ProjectStatus] ||
    PROJECT_STATUS_CONFIG.draft

  const handleGenerateInvoice = async (data: {
    projectId: string
    notes: string
    totalAmount: number
  }) => {
    try {
      setIsSubmittingInvoice(true)
      // Call your API / Server action to create the invoice here:
      // await createInvoice(data)
      console.log('Generating invoice data:', data)
      setIsInvoiceSheetOpen(false)
    } catch (error) {
      console.error('Failed to generate invoice:', error)
    } finally {
      setIsSubmittingInvoice(false)
    }
  }

  return (
    <>
      <header className="ds:items-between ds:justify-between flex flex-col gap-4 md:flex-row md:justify-between">
        {/* Left Metadata Group */}
        <div className="space-y-2">
          {/* Title + Status Badge */}
          <div className="flex items-center gap-3">
            <h1 className="text-foreground ds:text-2xl min-w-0 text-[22px] font-bold tracking-tight">
              {project.name}
            </h1>

            <FxBadge
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${config.badgeClass}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`}
                aria-hidden="true"
              />
              <span>{config.label}</span>
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
            <div className="text-muted-foreground compact:flex-row flex min-w-0 flex-col items-center gap-1 text-center md:items-center md:justify-center">
              <span>Contract</span>
              <span>{formattedValue}</span>
            </div>

            {/* Milestones Counter */}
            <div className="text-muted-foreground compact:justify-start compact:flex-row flex min-w-0 flex-col items-start justify-around gap-1 text-right md:items-center md:justify-start">
              <span>2/5</span>
              <span>milestones</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <nav
          aria-label="Project actions"
          className="ds:pt-0 flex items-start gap-3 md:items-center"
        >
          <FxButton
            variant="secondary"
            className="text-card-foreground border-border hover:bg-card hover:text-accent-foreground flex h-auto justify-center gap-1.5 px-3 py-2 text-center text-[13px] font-medium whitespace-normal sm:h-9 sm:whitespace-nowrap"
          >
            <Sparkles
              className="text-primary shrink-0"
              width={14}
              height={14}
            />
            <span className="leading-tight">Draft update</span>
          </FxButton>

          <FxButton
            variant="default"
            onClick={() => setIsInvoiceSheetOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-auto justify-center px-3 py-2 text-center text-[13px] font-semibold whitespace-normal sm:h-9 sm:whitespace-nowrap"
          >
            <span className="leading-tight">New Invoice</span>
          </FxButton>
        </nav>
      </header>

      {/* Invoice Side Sheet */}
      <NewInvoiceSheet
        open={isInvoiceSheetOpen}
        onOpenChange={setIsInvoiceSheetOpen}
        defaultProjectId={project.id}
        projects={invoiceProjects}
        onSubmit={handleGenerateInvoice}
        isSubmitting={isSubmittingInvoice}
      />
    </>
  )
}
