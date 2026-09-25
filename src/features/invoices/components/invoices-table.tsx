'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
  FxTableScroll,
} from '@/components/shared/fx-table'
import { TableBody } from '@/components/ui/table'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { InvoiceListItem } from '@/features/invoices/queries/get-invoices'
import { formatCurrency } from '@/lib/money'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLocale } from '@/context/locale-provider'

interface InvoicesTableProps {
  invoices: InvoiceListItem[]
  totalCount: number
  totalPages: number
  currentPage?: number
  onPageChange?: (page: number) => void
}

const STATUS_BADGE_CONFIG: Record<
  InvoiceListItem['status'],
  {
    label: string
    variant: 'success' | 'default' | 'destructive' | 'secondary' | 'warning'
  }
> = {
  paid: { label: 'Paid', variant: 'success' },
  due: { label: 'Due', variant: 'default' },
  overdue: { label: 'Overdue', variant: 'warning' },
  draft: { label: 'Draft', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
}

export function InvoicesTable({
  invoices,
  totalCount,
  totalPages,
  currentPage = 1,
}: InvoicesTableProps) {
  const locale = useLocale()
  const router = useRouter()
  const { currency } = useWorkspace()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())

    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <section aria-label="Invoices" className="space-y-4">
      {/* Table Container */}
      <div className="bg-card border-border/80 overflow-hidden rounded-2xl border shadow-xs">
        <FxTableScroll>
          <FxTable className="w-full table-fixed text-xs">
            <FxTableHeader>
              <FxTableRow>
                <FxTableHead className="w-[18%]">INVOICE</FxTableHead>
                <FxTableHead className="w-[30%]">PROJECT</FxTableHead>
                <FxTableHead className="w-[26%]">CLIENT</FxTableHead>
                <FxTableHead className="w-[12%]">STATUS</FxTableHead>
                <FxTableHead className="w-[14%] text-center">
                  AMOUNT
                </FxTableHead>
              </FxTableRow>
            </FxTableHeader>

            <TableBody>
              {invoices.length === 0 ? (
                <FxTableRow>
                  <FxTableCell
                    colSpan={5}
                    className="text-muted-foreground py-8 text-center text-sm"
                  >
                    No invoices found.
                  </FxTableCell>
                </FxTableRow>
              ) : (
                invoices.map((inv) => {
                  const statusConfig =
                    STATUS_BADGE_CONFIG[inv.status] || STATUS_BADGE_CONFIG.draft

                  return (
                    <FxTableRow key={inv.id}>
                      <FxTableCell className="text-foreground truncate text-[12.5px] font-bold">
                        {inv.number}
                      </FxTableCell>

                      <FxTableCell className="text-foreground truncate text-[13px] font-medium">
                        {inv.projectName}
                      </FxTableCell>

                      <FxTableCell className="text-muted-foreground truncate text-[13px]">
                        {inv.clientName}
                      </FxTableCell>

                      <FxTableCell>
                        <div className="flex text-[12px]">
                          <FxBadge variant={statusConfig.variant} size="sm" dot>
                            {statusConfig.label}
                          </FxBadge>
                        </div>
                      </FxTableCell>
                      <FxTableCell className="text-foreground truncate text-center text-[13px] font-extrabold">
                        {formatCurrency(inv.amount, currency, { locale })}
                      </FxTableCell>
                    </FxTableRow>
                  )
                })
              )}
            </TableBody>
          </FxTable>
        </FxTableScroll>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <nav
          aria-label="Invoices pagination"
          className="text-muted-foreground flex items-center justify-between px-2 text-xs"
        >
          <p className="font-medium">
            Page{' '}
            <span className="text-foreground font-semibold">{currentPage}</span>{' '}
            of{' '}
            <span className="text-foreground font-semibold">{totalPages}</span>{' '}
            ({totalCount} total)
          </p>

          <div className="flex items-center gap-1.5">
            <FxButton
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
              className="h-8 gap-1 px-2.5 text-xs font-medium"
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </FxButton>

            <FxButton
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              className="h-8 gap-1 px-2.5 text-xs font-medium"
            >
              Next
              <ChevronRight className="size-3.5" />
            </FxButton>
          </div>
        </nav>
      )}
    </section>
  )
}
