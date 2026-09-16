export interface InvoiceDraftLines {
  lines: InvoiceLine[]
  entryIds: string[]
  calloutMessage: string | null
  amount: number
  unratedNames: string[]
}

export interface InvoiceDraft extends InvoiceDraftLines {
  orgId: string
  projectId: string
  projectName: string
  engagement: EngagementModel
  currency: string
  periodStart: string | null
  periodEnd: string | null
  dueDate: string
}

export interface InvoiceProjectRow {
  id: string
  engagement: string
  contract_value: number | null
  retainer_hours: number | null
  retainer_amount: number | null
  retainer_overage?: number | null
  retainer_period?: string | null
}

export interface InvoiceEntryRow {
  id: string
  user_id: string
  duration_minutes: number | null
  work_date: string
}

export interface InvoiceAllocationRow {
  user_id: string
  rate: number | null
  effective_from: string
  effective_to: string | null
}

export interface InvoiceBuildContext {
  memberNames: Map<string, string>
  roundingMinutes: number
  periodStart?: string | null
  periodEnd?: string | null
}

export type EngagementModel = 'full_time' | 'part_time' | 'retainer' | 'fixed'

export interface InvoiceLine {
  id: string
  description: string
  typeLabel: string
  qty: string
  rate: string
  amount: number
  quantityValue?: number | null
  unitRateValue?: number | null
}

export interface ProjectInvoiceContext {
  id: string
  name: string
  clientName: string
  engagement: EngagementModel
  calloutMessage?: string | null
  retainerPeriod?: 'weekly' | 'monthly' | null
  lines: InvoiceLine[]
}

export interface InvoiceFormValues {
  projectId: string
  notes: string
}

export interface NewInvoiceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: ProjectInvoiceContext[]
  defaultProjectId?: string
  onSubmit?: (data: {
    projectId: string
    notes: string
    totalAmount: number
  }) => void
  isSubmitting?: boolean
  hasExistingInvoice?: boolean
}
