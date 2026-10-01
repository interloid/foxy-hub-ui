'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxCalendar } from '@/components/shared/fx-calendar'
import { FxField, FxFieldError, FxLabel } from '@/components/shared/fx-field'
import {
  FxPopoverContent,
  Popover,
  PopoverTrigger,
} from '@/components/shared/fx-menu'
import { useFormatter } from '@/context/locale-provider'
import { toISODate } from '@/lib/date'
import { numericDatePlaceholder } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Calendar as CalendarIcon } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import type { FieldError } from 'react-hook-form'

export const labelClass =
  'text-muted-foreground mb-1.5 block text-[13px] leading-normal font-medium'
export const controlClass =
  'border-border bg-muted text-foreground hover:bg-muted h-10 w-full rounded-md border px-3 text-[13px] font-normal'
// Select triggers match the Project name input's height. `h-10!` is needed because
// SelectTrigger's own `data-[size=default]:h-8` would otherwise win over a plain `h-10`.
export const selectTriggerClass =
  'bg-muted h-10! w-full cursor-pointer text-[13px]'

// Block negative symbol and scientific notation in numeric input fields
export function preventNegativeInput(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === '-' || e.key === 'e' || e.key === 'E') {
    e.preventDefault()
  }
}

export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        'text-muted-foreground text-[11px] font-semibold tracking-wider uppercase',
        className
      )}
    >
      {children}
    </h2>
  )
}

// Rendered in normal flow (unlike FxFieldError) so long hints can wrap; pair it with a
// `pb-0` field so the spacing matches fields that reserve room for an error.
export function FieldHint({ children }: { children: string }) {
  return <p className="text-muted-foreground pb-1 text-xs">{children}</p>
}

export function DatePicker({
  id,
  value,
  onChange,
  disabled,
  placeholder,
  invalid,
  className,
}: {
  id?: string
  value?: Date
  onChange: (date?: Date) => void
  disabled?: (date: Date) => boolean
  placeholder?: string
  invalid?: boolean
  className?: string
}) {
  const fmt = useFormatter()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <FxButton
          id={id}
          type="button"
          aria-invalid={invalid || undefined}
          className={cn(
            controlClass,
            'flex items-center justify-between gap-2',
            className
          )}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value
              ? fmt.date(toISODate(value), 'numeric')
              : (placeholder ?? numericDatePlaceholder(fmt.locale))}
          </span>
          <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
        </FxButton>
      </PopoverTrigger>
      <FxPopoverContent className="w-auto p-0" align="start">
        <FxCalendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date)
            setIsOpen(false)
          }}
          disabled={disabled}
          variant="compact"
        />
      </FxPopoverContent>
    </Popover>
  )
}

export function DateField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
}: {
  id: string
  label: string
  value?: Date
  onChange: (date?: Date) => void
  error?: FieldError
  hint?: string
  disabled?: (date: Date) => boolean
}) {
  return (
    <FxField
      data-invalid={Boolean(error) || undefined}
      className={!error && hint ? 'pb-0' : undefined}
    >
      <FxLabel htmlFor={id} className={labelClass}>
        {label}
      </FxLabel>
      <DatePicker
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        invalid={Boolean(error)}
      />
      {error ? (
        <FxFieldError errors={[error]} />
      ) : (
        hint && <FieldHint>{hint}</FieldHint>
      )}
    </FxField>
  )
}
