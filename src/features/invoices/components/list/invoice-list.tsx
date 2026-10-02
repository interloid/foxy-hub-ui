'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import {
  FxInputGroup,
  FxInputGroupAddon,
  FxInputGroupInput,
} from '@/components/shared/fx-input-group'
import {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
  FxTableScroll,
} from '@/components/shared/fx-table'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableBody } from '@/components/ui/table'
import { useFormatter, useLocale } from '@/context/locale-provider'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { formatCurrency } from '@/lib/money'
import { cn } from '@/lib/utils'
import { isBillingRole } from '@/lib/role'
import { ChevronLeft, ChevronRight, Info, Loader2, Search } from 'lucide-react'
import { useState, useTransition } from 'react'
import { sendInvoiceReminderAction } from '../../actions'
import { toast } from 'sonner'
import type {
  InvoiceClientOption,
  InvoiceKind,
  InvoiceListStatus,
  InvoiceRow,
} from './types'

const PAGE_SIZE = 10
const EVERY_CLIENT = 'all'

type StatusTab = 'all' | 'draft' | 'awaiting' | 'overdue' | 'paid'

const TABS: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'awaiting', label: 'Awaiting payment' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
]

// "Awaiting payment" is everything issued and unpaid - sent or overdue.
function inTab(status: InvoiceListStatus, tab: StatusTab) {
  if (tab === 'all') return true
  if (tab === 'awaiting') return status === 'sent' || status === 'overdue'
  return status === tab
}

const KIND_LABEL: Record<InvoiceKind, string> = {
  hours: 'Hours',
  retainer: 'Retainer',
  fixed: 'Fixed fee',
}

const STATUS_BADGE: Record<
  InvoiceListStatus,
  { label: string; variant: 'success' | 'destructive' | 'secondary' | 'info' }
> = {
  overdue: { label: 'Overdue', variant: 'destructive' },
  paid: { label: 'Paid', variant: 'success' },
  sent: { label: 'Sent', variant: 'secondary' },
  draft: { label: 'Draft', variant: 'info' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
}

/** Whole days from `from` to `to` (ISO dates); negative when `to` is earlier. */
function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round(
    (Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!)) / 86_400_000
  )
}

export function InvoiceList({
  invoices,
  clients,
  today,
}: {
  invoices: InvoiceRow[]
  clients: InvoiceClientOption[]
  today: string
}) {
  const fmt = useFormatter()
  const locale = useLocale()
  const { currency, orgSlug, userRole } = useWorkspace()
  // Reminding a client about money is billing: primary admin and admin only.
  const canRemindClients = isBillingRole(userRole)
  const [remindingId, setRemindingId] = useState<string | null>(null)
  const [, startReminding] = useTransition()

  const [tab, setTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const [clientId, setClientId] = useState(EVERY_CLIENT)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Counts reflect search + client, so each tab says what clicking it would show.
  const query = search.trim().toLowerCase()
  const matchesFilters = (inv: InvoiceRow) =>
    (clientId === EVERY_CLIENT || inv.clientId === clientId) &&
    (!query ||
      inv.number.toLowerCase().includes(query) ||
      inv.projectName.toLowerCase().includes(query) ||
      inv.clientName.toLowerCase().includes(query))

  const filtered = invoices.filter(matchesFilters)
  const counts = Object.fromEntries(
    TABS.map((t) => [
      t.id,
      filtered.filter((inv) => inTab(inv.status, t.id)).length,
    ])
  ) as Record<StatusTab, number>

  const rows = filtered.filter((inv) => inTab(inv.status, tab))
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )
  const rangeStart = rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, rows.length)

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((inv) => selected.has(inv.id))

  const resetPage = () => setPage(1)

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const inv of pageRows) {
        if (allOnPageSelected) next.delete(inv.id)
        else next.add(inv.id)
      }
      return next
    })

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const remind = (inv: InvoiceRow) => {
    setRemindingId(inv.id)
    startReminding(async () => {
      const res = await sendInvoiceReminderAction(orgSlug, inv.id)
      setRemindingId(null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Reminder for ${inv.number} sent to ${res.data.sentTo}`)
    })
  }

  const dueCaption = (inv: InvoiceRow) => {
    if (inv.status === 'paid' && inv.paidAt) {
      return {
        text: `Paid ${fmt.date(inv.paidAt, 'day')}`,
        className: 'text-success',
      }
    }
    if (!inv.dueDate || inv.status === 'draft' || inv.status === 'cancelled') {
      return null
    }
    const days = daysBetween(today, inv.dueDate)
    if (inv.status === 'overdue' || days < 0) {
      return {
        text: `${Math.abs(days)}d overdue`,
        className: 'text-destructive',
      }
    }
    return {
      text: days === 0 ? 'Due today' : `in ${days}d`,
      className: 'text-muted-foreground',
    }
  }

  return (
    <section aria-label="Invoices" className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div
          role="tablist"
          aria-label="Invoice status"
          className="bg-card border-border/80 flex w-fit flex-wrap items-center gap-1 rounded-xl border p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id)
                resetPage()
              }}
              className={cn(
                'text-muted-foreground hover:text-foreground cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                tab === t.id && 'bg-muted text-foreground font-semibold'
              )}
            >
              {t.label} · {counts[t.id]}
            </button>
          ))}
        </div>

        <FxInputGroup className="bg-card h-10 lg:max-w-72">
          <FxInputGroupAddon className="border-none">
            <Search className="text-muted-foreground size-4" />
          </FxInputGroupAddon>
          <FxInputGroupInput
            placeholder="Invoice no, project or client"
            aria-label="Search invoices"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetPage()
            }}
          />
        </FxInputGroup>

        <Select
          value={clientId}
          onValueChange={(value) => {
            setClientId(value)
            resetPage()
          }}
        >
          <SelectTrigger
            aria-label="Client"
            className="bg-card h-10! w-full cursor-pointer text-[13px] lg:w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            sideOffset={6}
            className="p-1"
          >
            <SelectItem
              value={EVERY_CLIENT}
              className="cursor-pointer p-2 text-[13px]"
            >
              Every client
            </SelectItem>
            {clients.map((c) => (
              <SelectItem
                key={c.id}
                value={c.id}
                className="cursor-pointer p-2 text-[13px]"
              >
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border-border/80 overflow-hidden rounded-2xl border shadow-xs">
        <FxTableScroll>
          <FxTable className="w-full min-w-225 table-fixed text-xs">
            <FxTableHeader>
              <FxTableRow>
                <FxTableHead className="w-10">
                  <Checkbox
                    aria-label="Select all invoices on this page"
                    checked={allOnPageSelected}
                    onCheckedChange={toggleAll}
                    disabled={pageRows.length === 0}
                  />
                </FxTableHead>
                <FxTableHead className="w-28">INVOICE</FxTableHead>
                <FxTableHead>PROJECT</FxTableHead>
                <FxTableHead className="w-44">CLIENT</FxTableHead>
                <FxTableHead className="w-28 text-right">AMOUNT</FxTableHead>
                <FxTableHead className="w-28">STATUS</FxTableHead>
                <FxTableHead className="w-28">DUE</FxTableHead>
                <FxTableHead className="w-40 text-right">ACTIONS</FxTableHead>
              </FxTableRow>
            </FxTableHeader>

            <TableBody>
              {pageRows.length === 0 ? (
                <FxTableRow>
                  <FxTableCell
                    colSpan={8}
                    className="text-muted-foreground py-8 text-center text-sm"
                  >
                    No invoices match these filters.
                  </FxTableCell>
                </FxTableRow>
              ) : (
                pageRows.map((inv) => {
                  const badge = STATUS_BADGE[inv.status]
                  const caption = dueCaption(inv)
                  const canRemind =
                    canRemindClients &&
                    (inv.status === 'sent' || inv.status === 'overdue')

                  return (
                    <FxTableRow key={inv.id} className="h-15">
                      <FxTableCell>
                        <Checkbox
                          aria-label={`Select ${inv.number}`}
                          checked={selected.has(inv.id)}
                          onCheckedChange={() => toggleOne(inv.id)}
                        />
                      </FxTableCell>
                      <FxTableCell>
                        <p className="text-foreground font-mono text-[13px] font-bold">
                          {inv.number}
                        </p>
                        <p className="text-muted-foreground text-2xs">
                          {KIND_LABEL[inv.kind]}
                        </p>
                      </FxTableCell>
                      <FxTableCell className="text-foreground truncate text-[13px]">
                        {inv.projectName}
                      </FxTableCell>
                      <FxTableCell className="text-muted-foreground truncate text-[13px]">
                        {inv.clientName}
                      </FxTableCell>
                      <FxTableCell className="text-foreground text-right font-mono text-[13px] font-bold">
                        {formatCurrency(inv.amount, currency, { locale })}
                      </FxTableCell>
                      <FxTableCell>
                        <FxBadge variant={badge.variant} size="sm" dot>
                          {badge.label}
                        </FxBadge>
                      </FxTableCell>
                      <FxTableCell>
                        <p className="text-foreground text-[13px]">
                          {inv.dueDate ? fmt.date(inv.dueDate, 'day') : '-'}
                        </p>
                        {caption && (
                          <p
                            className={cn(
                              'text-2xs font-medium',
                              caption.className
                            )}
                          >
                            {caption.text}
                          </p>
                        )}
                      </FxTableCell>
                      <FxTableCell>
                        <div className="flex items-center justify-end gap-2">
                          {canRemind && (
                            <FxButton
                              type="button"
                              variant="secondary"
                              size="xs"
                              disabled={remindingId !== null}
                              onClick={() => remind(inv)}
                              className="gap-1"
                            >
                              {remindingId === inv.id && (
                                <Loader2 className="size-3.5 animate-spin" />
                              )}
                              {remindingId === inv.id ? 'Sending...' : 'Remind'}
                            </FxButton>
                          )}
                          {inv.invoiceUrl ? (
                            <FxButton asChild variant="outline" size="xs">
                              {/* The Stripe-hosted invoice - what the client sees and pays. */}
                              <a
                                href={inv.invoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Open
                              </a>
                            </FxButton>
                          ) : (
                            <FxButton
                              type="button"
                              variant="outline"
                              size="xs"
                              disabled
                              title="No Stripe invoice yet - it is created when the invoice is issued"
                            >
                              Open
                            </FxButton>
                          )}
                        </div>
                      </FxTableCell>
                    </FxTableRow>
                  )
                })
              )}
            </TableBody>
          </FxTable>
        </FxTableScroll>

        <div className="border-border text-muted-foreground flex items-center justify-between border-t px-4 py-3 text-xs">
          <p>
            Showing {rangeStart}-{rangeEnd} of {rows.length}
          </p>
          <div className="flex items-center gap-2">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <FxButton
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
            </FxButton>
            <FxButton
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="size-4" />
            </FxButton>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Sending an invoice emails the client a Stripe-hosted payment link. No
        card data touches our servers; a signed webhook flips the status to
        Paid.
      </p>
    </section>
  )
}
