import * as React from 'react'

import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

function FxTableScroll({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="fx-table-scroll"
      className={cn('w-full overflow-x-auto', className)}
      {...props}
    >
      <div className="min-w-140">{children}</div>
    </div>
  )
}

function FxTable({ className, ...props }: React.ComponentProps<typeof Table>) {
  return (
    <Table
      data-slot="fx-table"
      className={cn('text-base', className)}
      {...props}
    />
  )
}

function FxTableHeader({
  className,
  ...props
}: React.ComponentProps<typeof TableHeader>) {
  return (
    <TableHeader
      data-slot="fx-table-header"
      className={cn('bg-muted', className)}
      {...props}
    />
  )
}

function FxTableHead({
  className,
  ...props
}: React.ComponentProps<typeof TableHead>) {
  return (
    <TableHead
      data-slot="fx-table-head"
      className={cn(
        'text-2xs text-subtle-foreground h-9 px-1.5 font-semibold tracking-[.04em] uppercase first:pl-4 last:pr-4',
        className
      )}
      {...props}
    />
  )
}

function FxTableRow({
  className,
  ...props
}: React.ComponentProps<typeof TableRow>) {
  return (
    <TableRow
      data-slot="fx-table-row"
      className={cn(
        'border-border hover:bg-muted cursor-pointer border-b',
        className
      )}
      {...props}
    />
  )
}

/** `numeric` right-aligns and switches to mono tabular-nums at 600 — house rule 04. */
function FxTableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<typeof TableCell> & { numeric?: boolean }) {
  return (
    <TableCell
      data-slot="fx-table-cell"
      className={cn(
        'px-1.5 py-3.25 text-base first:pl-4 last:pr-4',
        numeric && 'text-right font-mono font-semibold tabular-nums',
        className
      )}
      {...props}
    />
  )
}

export {
  FxTable,
  FxTableCell,
  FxTableHead,
  FxTableHeader,
  FxTableRow,
  FxTableScroll,
}
