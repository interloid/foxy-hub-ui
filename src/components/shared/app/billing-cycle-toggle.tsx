'use client'

import { FxToggleGroup, FxToggleGroupItem } from '@/components/shared/fx'

export type BillingCycle = 'monthly' | 'yearly'
export type BillingCycleVariant = 'default' | 'product'

const CYCLES: readonly { value: BillingCycle; label: string; hint?: string }[] =
  [
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly', hint: '· 2 months free' },
  ]

function BillingCycleToggle({
  value,
  onValueChange,
  variant = 'default',
  className,
}: {
  value: BillingCycle
  onValueChange: (next: BillingCycle) => void
  variant?: BillingCycleVariant
  className?: string
}) {
  const product = variant === 'product'
  const density = product ? 'cycle-product' : 'cycle'

  return (
    <FxToggleGroup
      type="single"
      density={density}
      value={value}
      onValueChange={(next: string) =>
        next && onValueChange(next as BillingCycle)
      }
      aria-label="Billing cycle"
      className={className}
    >
      {CYCLES.map((cycle) => (
        <FxToggleGroupItem
          key={cycle.value}
          value={cycle.value}
          density={density}
        >
          {product ? cycle.label : cycle.value}
          {product ? (
            cycle.value === 'yearly' ? (
              <span className="text-success ml-1">−17%</span>
            ) : null
          ) : cycle.hint ? (
            <span className="text-2xs font-medium opacity-80">
              {cycle.hint}
            </span>
          ) : null}
        </FxToggleGroupItem>
      ))}
    </FxToggleGroup>
  )
}

export { BillingCycleToggle }
