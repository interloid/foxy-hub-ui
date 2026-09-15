'use client'

import { cn } from '@/lib/utils'
import { START_FROM_OPTIONS } from './types'
import { FxButton } from '@/components/shared/fx-button'

interface StartFromSelectorProps {
  value: string
  onChange: (value: string) => void
}

export function StartFromSelector({ value, onChange }: StartFromSelectorProps) {
  return (
    <div className="w-full">
      <label className="text-foreground mb-1.5 block text-[13px] font-medium">
        Start from
      </label>
      <div className="grid grid-cols-2 gap-2">
        {START_FROM_OPTIONS.map((option) => {
          const isSelected = value === option
          return (
            <FxButton
              key={option}
              type="button"
              variant="outline"
              onClick={() => onChange(option)}
              className={cn(
                'border-border bg-muted/60 hover:bg-muted! h-auto justify-start p-2.5 text-left text-[12.5px] font-medium whitespace-normal transition-colors',
                isSelected
                  ? 'border-success bg-success/10 text-foreground ring-success hover:bg-success/10! ring-1'
                  : 'bg-muted/30 text-muted-foreground'
              )}
            >
              {option}
            </FxButton>
          )
        })}
      </div>
    </div>
  )
}
