'use client'

import { AlertCircle } from 'lucide-react'

import { FxBadge } from '@/components/shared/fx-badge'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
  FxTableScroll,
} from '@/components/shared/fx-table'
import { TableBody } from '@/components/ui/table'
import { useFormatter, useLocale } from '@/context/locale-provider'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { STATUS_BADGE } from '@/features/invoices/components/list/invoice-list'
import { formatCurrency } from '@/lib/money'

import type { ProjectInvoiceRow } from '../../queries/get-project-invoices'
import type { Project } from '../../types'
import type { ProjectInvoiceContext } from '../../types/invoice'
import { NewInvoiceButton } from '../meta/new-invoice-button'

interface ProjectInvoicesCardProps {
  project: Project
  invoices: ProjectInvoiceRow[]
  isError?: boolean
  invoiceProjects?: ProjectInvoiceContext[]
  isInvoiceError?: boolean
  hasExistingInvoice?: boolean
}

export function ProjectInvoicesCard({
  project,
  invoices,
  isError = false,
  invoiceProjects,
  isInvoiceError,
  hasExistingInvoice,
}: ProjectInvoicesCardProps) {
  const fmt = useFormatter()
  const locale = useLocale()
  const { currency } = useWorkspace()

  return (
    <section
      aria-labelledby="project-invoices-heading"
      className="bg-card border-border overflow-hidden rounded-xl border shadow-xs"
    >
      <header className="border-border/60 flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h3
            id="project-invoices-heading"
            className="text-foreground text-[15.5px] font-semibold"
          >
            Invoices for this project
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Generated from approved hours - the rounding rule is printed on each
            one.
          </p>
        </div>
        <NewInvoiceButton
          project={project}
          invoiceProjects={invoiceProjects}
          isInvoiceError={isInvoiceError}
          hasExistingInvoice={hasExistingInvoice}
          className="w-full shrink-0 sm:w-auto"
        />
      </header>

      {isError ? (
        <div className="text-destructive flex items-center gap-2 px-5 py-4 text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Failed to load invoices.</span>
        </div>
      ) : invoices.length === 0 ? (
        <p className="text-muted-foreground px-5 py-8 text-center text-sm">
          No invoices for this project yet.
        </p>
      ) : (
        <FxTable className="w-full min-w-150 table-fixed text-xs">
          <FxTableHeader>
            <FxTableRow>
              <FxTableHead className="w-40 pl-5">INVOICE</FxTableHead>
              <FxTableHead className="w-80">CLIENT</FxTableHead>
              <FxTableHead className="w-28">DUE</FxTableHead>
              <FxTableHead className="w-28">AMOUNT</FxTableHead>
              <FxTableHead className="w-28 pr-5">STATUS</FxTableHead>
            </FxTableRow>
          </FxTableHeader>
          <TableBody>
            {invoices.map((inv) => {
              const badge = STATUS_BADGE[inv.status]
              return (
                <FxTableRow key={inv.id} className="h-13">
                  <FxTableCell className="pl-5">
                    {inv.invoiceUrl ? (
                      // The Stripe-hosted invoice - what the client sees and pays.
                      <a
                        href={inv.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground font-mono text-[13px] font-bold hover:underline"
                      >
                        {inv.number}
                      </a>
                    ) : (
                      <span className="text-foreground font-mono text-[13px] font-bold">
                        {inv.number}
                      </span>
                    )}
                  </FxTableCell>
                  <FxTableCell
                    className="text-muted-foreground truncate text-[13px]"
                    title={project.clientName}
                  >
                    {project.clientName}
                  </FxTableCell>
                  <FxTableCell className="text-foreground text-[13px]">
                    {inv.dueDate ? fmt.date(inv.dueDate, 'day') : '-'}
                  </FxTableCell>
                  <FxTableCell className="text-foreground font-mono text-[13px] font-bold">
                    {formatCurrency(inv.amount, currency, { locale })}
                  </FxTableCell>
                  <FxTableCell className="pr-5">
                    <FxBadge variant={badge.variant} size="sm" dot>
                      {badge.label}
                    </FxBadge>
                  </FxTableCell>
                </FxTableRow>
              )
            })}
          </TableBody>
        </FxTable>
      )}
    </section>
  )
}
