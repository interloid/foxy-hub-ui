'use client'

import { REGEXP_ONLY_DIGITS } from 'input-otp'
import type { ComponentProps } from 'react'

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { cn } from '@/lib/utils'

const SLOT_CLASS =
  'bg-muted border-border text-foreground size-11 text-lg font-semibold first:rounded-l-lg last:rounded-r-lg data-[active=true]:border-ring data-[active=true]:ring-ring/30 aria-invalid:border-destructive'

function FxInputOtp({
  length = 6,
  invalid,
  className,
  containerClassName,
  ...props
}: Omit<
  ComponentProps<typeof InputOTP>,
  'maxLength' | 'render' | 'children'
> & {
  length?: number
  invalid?: boolean
}) {
  const first = Math.ceil(length / 2)

  return (
    <InputOTP
      data-slot="fx-input-otp"
      maxLength={length}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-invalid={invalid || undefined}
      className={className}
      containerClassName={cn('gap-2', containerClassName)}
      {...props}
    >
      <InputOTPGroup>
        {Array.from({ length: first }, (_, index) => (
          <InputOTPSlot
            key={index}
            index={index}
            aria-invalid={invalid || undefined}
            className={SLOT_CLASS}
          />
        ))}
      </InputOTPGroup>
      <InputOTPSeparator className="text-subtle-foreground" />
      <InputOTPGroup>
        {Array.from({ length: length - first }, (_, index) => (
          <InputOTPSlot
            key={first + index}
            index={first + index}
            aria-invalid={invalid || undefined}
            className={SLOT_CLASS}
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}

export { FxInputOtp }
