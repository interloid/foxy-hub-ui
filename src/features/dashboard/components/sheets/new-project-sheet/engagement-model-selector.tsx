'use client'

import { FxButton } from '@/components/shared/fx-button'
import { cn } from '@/lib/utils'
import { ENGAGEMENT_MODELS } from './types'

interface EngagementModelSelectorProps {
  value: string
  onChange: (value: string) => void
}

export function EngagementModelSelector({
  value,
  onChange,
}: EngagementModelSelectorProps) {
  return (
    <div className="w-full">
      <label className="text-foreground mb-1.5 block text-[13px] font-medium">
        Engagement model
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ENGAGEMENT_MODELS.map((model) => {
          const isSelected = value === model.id
          return (
            <FxButton
              key={model.id}
              type="button"
              variant="outline"
              onClick={() => onChange(model.id)}
              className={cn(
                'border-border relative flex h-auto flex-col items-start justify-start rounded-md border p-3 text-left whitespace-normal transition-colors',
                isSelected
                  ? 'border-primary bg-primary/10 ring-primary ring-1'
                  : 'bg-muted/30 hover:bg-muted/60'
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn('size-2 rounded-full', model.colorClass)} />
                <span className="text-foreground text-[13px] font-semibold">
                  {model.title}
                </span>
              </div>
              <span className="text-muted-foreground mt-1 text-[11.5px]">
                {model.subtitle}
              </span>
            </FxButton>
          )
        })}
      </div>
    </div>
  )
}
