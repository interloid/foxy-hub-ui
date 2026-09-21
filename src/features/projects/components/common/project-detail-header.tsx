'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'

import { formatCurrency } from '@/lib/money'
import { createInvoiceAction } from '../../actions'
import {
  NON_INVOICEABLE_STATUSES,
  PROJECT_STATUS_CONFIG,
} from '../../constants'
import type { Project, ProjectStatus } from '../../types'
import { ProjectInvoiceContext } from '../../types/invoice'
import { NewInvoiceSheet } from '../meta/new-invoice-sheet'
import { EditProjectSheet } from './edit-project-sheet'

interface ProjectDetailHeaderProps {
  project: Project
  invoiceProjects?: ProjectInvoiceContext[]
  isInvoiceError?: boolean
  hasExistingInvoice?: boolean
}

export function ProjectDetailHeader({
  project,
  invoiceProjects = [],
  isInvoiceError = false,
  hasExistingInvoice,
}: ProjectDetailHeaderProps) {
  const [isInvoiceSheetOpen, setIsInvoiceSheetOpen] = useState(false)
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false)
  const [isUpdateProjectOpen, setIsUpdateProjectOpen] = useState(false)

  const { orgSlug, currency } = useWorkspace()

  const formattedValue = formatCurrency(
    project.contractValue ?? project.retainerAmount ?? 0,
    currency
  )

  const clientInitials = project.clientName
    ? project.clientName.substring(0, 2).toUpperCase()
    : 'NW'

  const config =
    PROJECT_STATUS_CONFIG[project.status as ProjectStatus] ||
    PROJECT_STATUS_CONFIG.draft
  // Determine if an invoice already exists for this project

  const handleGenerateInvoice = async (data: {
    projectId: string
    notes: string
    totalAmount: number
  }) => {
    setIsSubmittingInvoice(true)

    const res = await createInvoiceAction({
      projectId: data.projectId,
      orgSlug,
      notes: data.notes,
    })

    setIsSubmittingInvoice(false)

    if (!res.ok) {
      toast.error(res.error)
      return
    }

    toast.success('Invoice generated')
    setIsInvoiceSheetOpen(false)
  }

  const handleOpenInvoiceSheet = () => {
    if (isInvoiceError) {
      toast.error(
        'Unable to load invoicing data. Please refresh and try again.'
      )
      return
    }
    if (NON_INVOICEABLE_STATUSES.has(project.status)) {
      toast.error(
        `This project is ${project.status} and can no longer be invoiced.`
      )
      return
    }
    setIsInvoiceSheetOpen(true)
  }

  return (
    <>
      <header className="ds:items-between ds:justify-between flex flex-col gap-4 md:flex-row md:justify-between">
        <div className="space-y-2">
          <Link
            href={`/${orgSlug}/projects`}
            className="text-muted-foreground hover:text-foreground duration-fast inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            All Projects
          </Link>

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
                className="bg-primary compact:flex! text-primary-foreground hidden h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold select-none"
              >
                {clientInitials}
              </div>
              <span className="text-muted-foreground min-w-0 font-medium wrap-break-word">
                {project.clientName}
              </span>
            </div>

            {/* Contract / Budget */}
            <div className="text-muted-foreground compact:flex-row flex min-w-0 flex-col items-center justify-start gap-1 text-center md:items-center md:justify-center">
              <span>Contract</span>
              <span>{formattedValue}</span>
            </div>

            {/* Milestones Counter */}
            <div className="text-muted-foreground compact:items-center compact:justify-start compact:flex-row flex min-w-0 flex-col items-start justify-around gap-1 text-right md:items-center md:justify-start">
              <span>Milestones</span>
              <span>
                {project.milestones?.completed}/{project.milestones?.total}
              </span>
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
            onClick={() => setIsUpdateProjectOpen(true)}
            className="text-card-foreground border-border hover:bg-card flex h-auto justify-center gap-1.5 px-3 py-2 text-center text-[13px] font-medium whitespace-normal sm:h-9 sm:whitespace-nowrap"
          >
            <span className="leading-tight">Update Project</span>
          </FxButton>

          <FxButton
            variant="default"
            onClick={handleOpenInvoiceSheet}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-auto justify-center px-3 py-2 text-center text-[13px] font-semibold whitespace-normal sm:h-9 sm:whitespace-nowrap"
          >
            <span className="leading-tight">New Invoice</span>
          </FxButton>
        </nav>
      </header>

      <NewInvoiceSheet
        open={isInvoiceSheetOpen}
        onOpenChange={setIsInvoiceSheetOpen}
        defaultProjectId={project.id}
        projects={invoiceProjects}
        onSubmit={handleGenerateInvoice}
        isSubmitting={isSubmittingInvoice}
        hasExistingInvoice={hasExistingInvoice}
      />
      <EditProjectSheet
        project={project}
        open={isUpdateProjectOpen}
        onOpenChange={setIsUpdateProjectOpen}
      />
    </>
  )
}
