'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxInput } from '@/components/shared/fx-field'
import * as React from 'react'

interface DurationInputProps {
  value?: string
  onChange: (value: string) => void
  dailyCapacityHours?: number
  alreadyLoggedMinutes?: number
  className?: string
  onErrorChange?: (hasError: boolean) => void
}

function parseDurationToMinutes(val: string): number | null {
  const trimmed = val.trim().toLowerCase()
  if (!trimmed || trimmed.includes('-')) return null

  // Matches pattern: 1h 30m, 1h, 30m, 90m
  const timeRegex = /^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+)m)?$/
  const timeMatch = trimmed.match(timeRegex)

  if (timeMatch && (timeMatch[1] !== undefined || timeMatch[2] !== undefined)) {
    const hours = timeMatch[1] ? parseFloat(timeMatch[1]) : 0
    const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
    const total = Math.round(hours * 60 + mins)
    return isNaN(total) || total <= 0 ? null : total
  }

  // Decimal / integer hours (e.g. 0.5, 5)
  const num = parseFloat(trimmed)
  if (!isNaN(num) && num > 0) {
    return Math.round(num * 60)
  }

  return null
}

function formatMinutesToLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60

  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`
  if (hours > 0) return `${hours}h`
  return `${mins}m`
}

export function DurationInput({
  value = '',
  onChange,
  dailyCapacityHours = 8,
  alreadyLoggedMinutes = 0,
  className,
  onErrorChange,
}: DurationInputProps) {
  const parsedMinutes = React.useMemo(
    () => parseDurationToMinutes(value),
    [value]
  )

  const maxAllowedMinutes = dailyCapacityHours * 60
  const remainingMinutes = Math.max(0, maxAllowedMinutes - alreadyLoggedMinutes)

  // Validation Flags
  const isSyntaxInvalid = value.trim().length > 0 && parsedMinutes === null
  const isExceedingCapacity =
    parsedMinutes !== null &&
    alreadyLoggedMinutes + parsedMinutes > maxAllowedMinutes

  const isInvalid = isSyntaxInvalid || isExceedingCapacity

  // Notify parent of error state changes
  React.useEffect(() => {
    onErrorChange?.(isInvalid)
  }, [isInvalid, onErrorChange])

  return (
    <div className={className || 'w-full'}>
      <label className="text-foreground mb-2 block text-[13px] font-medium">
        Duration <span className="text-destructive">*</span>
      </label>

      {/* FxInput with Computed Time Badge */}
      <div className="relative flex items-center">
        <FxInput
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="1.5  ·  1h 30m  ·  90m"
          className={`pr-24 font-mono text-[13px] ${
            isInvalid ? 'border-destructive focus-visible:ring-destructive' : ''
          }`}
        />

        {parsedMinutes !== null && (
          <span className="text-muted-foreground pointer-events-none absolute right-3 font-mono text-[12px] font-medium">
            = {formatMinutesToLabel(parsedMinutes)}
          </span>
        )}
      </div>

      {/* Quick Select Pills */}
      <div className="mt-2 flex items-center gap-2">
        {['30m', '1h', '2h', '4h'].map((pill) => (
          <FxButton
            key={pill}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(pill)}
            className="h-7 rounded-full px-3 text-[12px] font-medium"
          >
            {pill}
          </FxButton>
        ))}
      </div>

      {/* Error Feedback */}
      {isSyntaxInvalid && (
        <p className="text-destructive mt-1.5 text-[11.5px] font-medium">
          Invalid value. Enter positive numbers (e.g. 0.5, 5) or units (e.g.
          90m, 1h 30m).
        </p>
      )}

      {isExceedingCapacity && (
        <p className="text-destructive mt-1.5 text-[11.5px] font-medium">
          Exceeds daily capacity limit of {dailyCapacityHours}h. You have logged{' '}
          {formatMinutesToLabel(alreadyLoggedMinutes)} on this date (
          {formatMinutesToLabel(remainingMinutes)} remaining).
        </p>
      )}

      {!isInvalid && (
        <p className="text-muted-foreground mt-1.5 text-[11.5px]">
          Stored to the exact minute — accepts{' '}
          <code className="font-mono">1.5</code>,{' '}
          <code className="font-mono">1h 30m</code>, or{' '}
          <code className="font-mono">90m</code>.
        </p>
      )}
    </div>
  )
}
