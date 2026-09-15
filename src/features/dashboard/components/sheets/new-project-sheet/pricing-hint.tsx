'use client'

import { AlertTriangle } from 'lucide-react'

import { FxButton } from '@/components/shared/fx-button'
import type { PricingInsight } from '@/features/dashboard/pricing'

interface PricingHintProps {
  insight: PricingInsight
  hasValue: boolean
  onUseSuggestion: (amount: number) => void
}

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function PricingHint({
  insight,
  hasValue,
  onUseSuggestion,
}: PricingHintProps) {
  const { suggestion, burnRate, warnings } = insight

  if (!suggestion && !burnRate && warnings.length === 0) return null

  return (
    <div className="space-y-2">
      {suggestion && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-muted-foreground text-[12px]">
            Suggested from staffing:{' '}
            <span className="text-foreground font-semibold">
              {money(suggestion.amount)}
            </span>{' '}
            <span className="text-subtle-foreground">({suggestion.basis})</span>
          </p>

          {!hasValue && (
            <FxButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onUseSuggestion(suggestion.amount)}
              className="border-border text-foreground hover:bg-muted h-6 bg-transparent px-2 text-[11px] font-medium"
            >
              Use this
            </FxButton>
          )}
        </div>
      )}

      {!suggestion && burnRate && (
        <p className="text-muted-foreground text-[12px]">
          At this staffing:{' '}
          <span className="text-foreground font-semibold">
            {money(burnRate.perDay)}/day
          </span>{' '}
          · {money(burnRate.perWeek)}/week · {money(burnRate.perMonth)}/month
        </p>
      )}

      {warnings.length > 0 && (
        <div className="border-warning/40 bg-warning/10 space-y-1.5 rounded-lg border p-3">
          {warnings.map((warning) => (
            <div key={warning.kind} className="flex items-start gap-2">
              <AlertTriangle className="text-warning mt-0.5 size-3.5 shrink-0" />
              <p className="text-foreground text-[12px] leading-snug">
                {warning.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
