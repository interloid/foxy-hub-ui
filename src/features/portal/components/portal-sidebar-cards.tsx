'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import type { PortalInvoice, PortalTeamMember } from '@/features/portal/queries'
import { formatCurrency } from '@/lib/money'

import { PayNowButton } from './portal-invoices-card'

const STATUS_BADGE: Record<
  PortalInvoice['status'],
  { label: string; variant: 'success' | 'default' | 'warning' | 'destructive' }
> = {
  paid: { label: 'Paid', variant: 'success' },
  due: { label: 'Due', variant: 'default' },
  overdue: { label: 'Overdue', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  draft: { label: 'Draft', variant: 'default' },
}

export function PortalInvoicesSummary({
  invoices,
  projectName,
}: {
  invoices: PortalInvoice[]
  projectName: string
}) {
  return (
    <section
      aria-labelledby="portal-invoices-heading"
      className="bg-card border-border rounded-xl border shadow-xs"
    >
      <h3
        id="portal-invoices-heading"
        className="text-foreground border-border/60 border-b px-5 py-4 text-[14px] font-semibold"
      >
        Invoices
      </h3>

      {invoices.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-center text-sm">
          No invoices for this project yet.
        </p>
      ) : (
        <div className="divide-border/60 divide-y">
          {invoices.map((invoice) => {
            const badge = STATUS_BADGE[invoice.status]

            return (
              <div key={invoice.id} className="space-y-1 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-foreground text-[13.5px] font-semibold">
                    {invoice.number}
                  </span>
                  <FxBadge variant={badge.variant}>{badge.label}</FxBadge>
                </div>

                <p className="text-muted-foreground truncate text-[12.5px]">
                  {projectName}
                </p>

                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <span className="text-foreground text-[15px] font-semibold">
                    {/* The invoice's own currency — it keeps what it was raised in. */}
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </span>

                  <PayNowButton invoice={invoice} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function PortalTeamCard({
  team,
  orgName,
}: {
  team: PortalTeamMember[]
  orgName: string
}) {
  return (
    <section
      aria-labelledby="portal-team-heading"
      className="bg-card border-border rounded-xl border shadow-xs"
    >
      <h3
        id="portal-team-heading"
        className="text-foreground border-border/60 border-b px-5 py-4 text-[14px] font-semibold"
      >
        Your project team
      </h3>

      {team.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-center text-sm">
          No contact listed yet.
        </p>
      ) : (
        <div className="space-y-4 p-5">
          {team.map((member) => (
            <div key={member.id} className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="bg-info text-brand-white flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold shadow-xs"
              >
                {member.initials}
              </div>
              <div className="min-w-0">
                <p className="text-foreground truncate text-[14px] leading-tight font-semibold">
                  {member.name}
                </p>
                <p className="text-subtle-foreground truncate text-[12.5px]">
                  {member.role} · {orgName}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function PortalHelpCard({ orgName }: { orgName: string }) {
  return (
    <section className="bg-card border-border rounded-xl border p-5 shadow-xs">
      <h3 className="text-foreground text-[14px] font-semibold">Need help?</h3>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Reach out to {orgName} for anything about scope, deliverables, or
        billing on this project.
      </p>
    </section>
  )
}
