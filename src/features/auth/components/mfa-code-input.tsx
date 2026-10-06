'use client'

import { FxInputOtp } from '@/components/shared/fx-input-otp'
import { MFA_CODE_LENGTH } from '@/lib/mfa'

export function MfaCodeInput({
  id,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus,
  className,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  autoFocus?: boolean
  className?: string
}) {
  return (
    <FxInputOtp
      id={id}
      length={MFA_CODE_LENGTH}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      invalid={invalid}
      autoFocus={autoFocus}
      containerClassName={className}
    />
  )
}
