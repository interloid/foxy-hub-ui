import { FxBadge } from '@/components/shared/fx-badge'
import { AlertCircle } from 'lucide-react'
import Image from 'next/image'
import type {
  EngagementModel,
  ProjectAllocationItem,
  RetainerPeriod,
} from '../../types'
import { EndAllocationControl } from '../time-tracking/end-allocation-control'

interface EngagementCardProps {
  engagementModel?: EngagementModel | null
  allocations?: ProjectAllocationItem[] | null
  projectId?: string
  canManage?: boolean
  retainerBucketHours?: number | null
  retainerPeriod?: RetainerPeriod | null
  retainerFee?: number | null
  overageMultiplier?: number | string | null
  fixedPriceFee?: number | null
  isError?: boolean
}

function formatMoney(value?: number | null): string {
  return value === null || value === undefined
    ? '—'
    : `$${value.toLocaleString()}`
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function EngagementCard({
  engagementModel = 'full_time',
  allocations = [],
  projectId,
  canManage = false,
  retainerBucketHours,
  retainerPeriod,
  retainerFee,
  overageMultiplier,
  fixedPriceFee,
  isError = false,
}: EngagementCardProps) {
  const safeAllocations = allocations ?? []

  // Total committed hours per day across active allocations
  const totalHoursPerDay = safeAllocations.reduce(
    (acc, item) => acc + (item.hoursPerDay || 0),
    0
  )

  return (
    <section
      aria-labelledby="engagement-card-heading"
      className="bg-card border-border rounded-xl border shadow-xs"
    >
      {/* Header Section */}
      <div className="border-border/60 flex items-center justify-between border-b px-5 py-4">
        <h3
          id="engagement-card-heading"
          className="text-foreground text-[14px] font-semibold"
        >
          Engagement
        </h3>
        {!isError && <BadgeForModel model={engagementModel} />}
      </div>

      {/* Content Body */}
      <div className="space-y-4 p-5">
        {isError ? (
          <div className="text-destructive flex items-center gap-2 py-4 text-xs font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Failed to load engagement details.</span>
          </div>
        ) : (
          <>
            {/* Model Details Header */}
            <EngagementDetails
              model={engagementModel}
              totalHoursPerDay={totalHoursPerDay}
              retainerBucketHours={retainerBucketHours}
              retainerPeriod={retainerPeriod}
              retainerFee={retainerFee}
              overageMultiplier={overageMultiplier}
              fixedPriceFee={fixedPriceFee}
            />

            {/* Allocated Section */}
            <div className="pt-1">
              <span className="text-subtle-foreground/80 mb-3 block text-[10.5px] font-semibold tracking-wider uppercase">
                Allocated
              </span>

              {safeAllocations.length > 0 ? (
                <div className="space-y-4">
                  {safeAllocations.map((alloc) => (
                    <div
                      key={alloc.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        {alloc.userAvatarUrl ? (
                          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                            <Image
                              src={alloc.userAvatarUrl}
                              alt={alloc.userName}
                              fill
                              sizes="32px"
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold select-none">
                            {getInitials(alloc.userName)}
                          </div>
                        )}

                        <div>
                          <p className="text-foreground text-[13px] leading-tight font-semibold">
                            {alloc.userName}
                          </p>
                          <p className="text-subtle-foreground text-xs leading-normal">
                            {alloc.hoursPerDay} h/day x {alloc.daysPerWeek}{' '}
                            days/wk
                          </p>
                        </div>
                      </div>

                      <div className="compact:flex-row compact:items-center flex shrink-0 flex-col items-end gap-2">
                        {/* Hourly Rate */}
                        {alloc.rate !== null && alloc.rate !== undefined && (
                          <span className="text-subtle-foreground text-xs font-bold">
                            ${alloc.rate}/hr
                          </span>
                        )}
                        {canManage && projectId && (
                          <EndAllocationControl
                            allocationId={alloc.id}
                            projectId={projectId}
                            userName={alloc.userName}
                            effectiveFrom={alloc.effectiveFrom}
                            effectiveTo={alloc.effectiveTo}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs italic">
                  No team members allocated.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/* Badge selector matching design color schemes */
function BadgeForModel({ model }: { model?: EngagementModel | null }) {
  switch (model) {
    case 'full_time':
      return (
        <FxBadge variant="warning" shape="pill" dot>
          Full-time
        </FxBadge>
      )
    case 'part_time':
      return (
        <FxBadge variant="info" shape="pill" dot>
          Part-time
        </FxBadge>
      )
    case 'retainer':
      return (
        <FxBadge variant="warning" shape="pill" dot>
          Retainer
        </FxBadge>
      )
    case 'fixed':
      return (
        <FxBadge variant="success" shape="pill" dot>
          Fixed price
        </FxBadge>
      )
    default:
      return null
  }
}

/* Dynamic details block per engagement model */
function EngagementDetails({
  model,
  totalHoursPerDay,
  retainerBucketHours,
  retainerPeriod,
  retainerFee,
  overageMultiplier,
  fixedPriceFee,
}: {
  model?: EngagementModel | null
  totalHoursPerDay: number
  retainerBucketHours?: number | null
  retainerPeriod?: RetainerPeriod | null
  retainerFee?: number | null
  overageMultiplier?: number | string | null
  fixedPriceFee?: number | null
}) {
  const periodWord = retainerPeriod === 'weekly' ? 'week' : 'month'
  const periodAdjective = retainerPeriod === 'weekly' ? 'weekly' : 'monthly'

  switch (model) {
    case 'full_time':
      return (
        <p className="text-subtle-foreground text-xs font-normal">
          {totalHoursPerDay} h/day committed
        </p>
      )

    case 'part_time':
      return (
        <p className="text-muted-foreground text-xs font-normal">
          Any fraction of a day
        </p>
      )

    case 'retainer':
      return (
        <div className="space-y-2 border-b pb-4">
          <p className="text-muted-foreground text-xs font-normal">
            A {periodAdjective} bucket of hours
          </p>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Bucket</span>
              <span className="text-foreground font-bold">
                {retainerBucketHours ?? '—'} h / {periodWord}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Retainer</span>
              <span className="text-foreground font-bold">
                {formatMoney(retainerFee)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Beyond bucket</span>
              <span className="text-foreground font-bold">
                {overageMultiplier === null || overageMultiplier === undefined
                  ? '—'
                  : `x ${overageMultiplier} overage rate`}
              </span>
            </div>
          </div>
        </div>
      )

    case 'fixed':
      return (
        <div className="space-y-2 border-b pb-4">
          <p className="text-muted-foreground text-xs font-normal">
            Set fee hours tracked, not billed
          </p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Fixed price</span>
            <span className="text-foreground font-bold">
              {formatMoney(fixedPriceFee)}
            </span>
          </div>
        </div>
      )

    default:
      return null
  }
}
