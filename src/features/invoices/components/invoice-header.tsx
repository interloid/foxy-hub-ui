'use client'

import { FxButton } from '@/components/shared/fx-button'
import { createInvoiceAction } from '@/features/projects/actions'
import { NewInvoiceSheet } from '@/features/projects/components/meta/new-invoice-sheet'
import { ProjectInvoiceContext } from '@/features/projects/types/invoice'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface InvoicesHeaderProps {
  orgSlug: string
  isTestMode?: boolean
  projects: ProjectInvoiceContext[]
}

export function InvoicesHeader({
  orgSlug,
  isTestMode = true,
  projects,
}: InvoicesHeaderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false)

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
    setIsOpen(false)
  }

  return (
    <>
      <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-foreground text-[24px] font-bold tracking-tight">
            Invoices
          </h1>
          <p className="text-subtle-foreground text-[14px]">
            Billing to clients — powered by Stripe
            {isTestMode && ' (test mode)'}.
          </p>
        </div>

        <div>
          <FxButton
            onClick={() => setIsOpen(true)}
            variant={'default'}
            className="bg-primary text-brand-white px-3 py-4"
          >
            <Plus className="size-4 stroke-[2.5]" />
            New invoice
          </FxButton>
        </div>
      </header>

      {/* Render the sheet controlled by state */}
      <NewInvoiceSheet
        open={isOpen}
        onOpenChange={setIsOpen}
        projects={projects}
        defaultProjectId={projects[0].id}
        onSubmit={handleGenerateInvoice}
        isSubmitting={isSubmittingInvoice}
      />
    </>
  )
}
