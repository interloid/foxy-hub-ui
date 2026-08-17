import { CheckIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { OnboardPlan } from '../data'

function OnboardPlanCard({
  plan,
  price,
  cadence,
  selected = false,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'children'> & {
  plan: OnboardPlan
  price: string
  cadence: string
  selected?: boolean
}) {
  return (
    <button
      type="button"
      data-slot="onboard-plan-card"
      data-selected={selected || undefined}
      aria-pressed={selected}
      className={cn(
        'relative rounded-xl p-4.5 text-left leading-[normal] transition-colors duration-(--duration-fast)',

        selected
          ? 'border-primary bg-primary-subtle border-2'
          : 'border-border bg-card hover:border-border-strong border',
        className
      )}
      {...props}
    >
      {plan.popular ? (
        <span className="bg-primary text-primary-foreground absolute -top-2.5 right-3.5 rounded-[20px] px-2.25 py-0.5 text-[10.5px] font-bold tracking-[.03em]">
          POPULAR
        </span>
      ) : null}

      <div className="text-[15px] font-semibold">{plan.name}</div>
      <div className="text-subtle-foreground mb-3 min-h-8.5 text-sm">
        {plan.blurb}
      </div>

      <div className="mb-1 flex items-baseline gap-1">
        <span className="text-[28px] font-bold tracking-[-0.02em] tabular-nums">
          {price}
        </span>
        <span className="text-subtle-foreground text-base">{cadence}</span>
      </div>
      <div className="text-subtle-foreground mb-3.5 text-[12px]">
        {plan.seats}
      </div>

      <div className="flex flex-col gap-2">
        {plan.features.map((feature) => (
          <div
            key={feature}
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
            <CheckIcon
              className={cn(
                'size-3.75 shrink-0',
                selected ? 'text-primary' : 'text-success'
              )}
              strokeWidth={2.2}
            />
            {feature}
          </div>
        ))}
      </div>
    </button>
  )
}

export { OnboardPlanCard }
