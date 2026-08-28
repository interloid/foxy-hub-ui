'use client'

import { cn } from '@/lib/utils'
import { START_FROM_OPTIONS } from './types'

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
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={cn(
                'border-border rounded-md border p-2.5 text-left text-[12.5px] font-medium transition-colors',
                isSelected
                  ? 'border-primary bg-primary/10 text-foreground ring-primary ring-1'
                  : 'bg-muted/30 text-muted-foreground hover:bg-muted/60'
              )}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
