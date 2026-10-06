'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { cn } from '@/lib/utils'

import { createInvoiceAction } from '../../actions'
import { NON_INVOICEABLE_STATUSES } from '../../constants'
import type { Project } from '../../types'
import type { ProjectInvoiceContext } from '../../types/invoice'
import { NewInvoiceSheet } from './new-invoice-sheet'

interface NewInvoiceButtonProps {
  project: Project
  invoiceProjects?: ProjectInvoiceContext[]
  isInvoiceError?: boolean
  hasExistingInvoice?: boolean
  className?: string
}

/** The "New invoice" button and the sheet it opens - used by the header and the Invoices tab. */
export function NewInvoiceButton({
  project,
  invoiceProjects = [],
  isInvoiceError = false,
  hasExistingInvoice,
  className,
}: NewInvoiceButtonProps) {
  const { orgSlug } = useWorkspace()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleGenerateInvoice = async (data: {
    projectId: string
    notes: string
    totalAmount: number
    periodStart?: string | null
  }) => {
    setIsSubmitting(true)

    const res = await createInvoiceAction({
      projectId: data.projectId,
      orgSlug,
      notes: data.notes,
      periodStart: data.periodStart,
    })

    setIsSubmitting(false)

    if (!res.ok) {
      toast.error(res.error)
      return
    }

    toast.success('Invoice generated')
    setIsOpen(false)
  }

  const handleOpen = () => {
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
    setIsOpen(true)
  }

  return (
    <>
      <FxButton
        variant="default"
        onClick={handleOpen}
        className={cn(
          'bg-primary text-primary-foreground hover:bg-primary/90 h-auto justify-center px-3 py-2 text-center text-[13px] font-semibold whitespace-normal sm:h-9 sm:whitespace-nowrap',
          className
        )}
      >
        <span className="leading-tight">New Invoice</span>
      </FxButton>

      <NewInvoiceSheet
        open={isOpen}
        onOpenChange={setIsOpen}
        defaultProjectId={project.id}
        projects={invoiceProjects}
        onSubmit={handleGenerateInvoice}
        isSubmitting={isSubmitting}
        hasExistingInvoice={hasExistingInvoice}
      />
    </>
  )
}
