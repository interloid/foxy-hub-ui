'use client'

import {
  FxButton,
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { sendPasswordReset } from '../actions'
import { FORGOT_PASSWORD, SIGN_IN } from '../data'
import { resetRequestSchema, type ResetRequestInput } from '../schemas'

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const form = useForm<ResetRequestInput>({
    resolver: zodResolver(resetRequestSchema),
    mode: 'onTouched',
    defaultValues: { email: '' },
  })

  const submit = form.handleSubmit((values) => {
    setError(null)
    startTransition(async () => {
      const result = await sendPasswordReset(values.email)
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.')
        return
      }
      setSentTo(values.email)
    })
  })

  if (sentTo) {
    return (
      <div className="flex max-w-100 flex-col gap-3.5">
        <div
          role="status"
          className="border-success bg-success-subtle text-success rounded-lg border px-4 py-3 text-base"
        >
          {FORGOT_PASSWORD.sent(sentTo)}
        </div>
        <Link
          href="/sign-in"
          className="text-primary-accent hover:text-primary self-start text-base font-semibold"
        >
          {FORGOT_PASSWORD.back}
        </Link>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex max-w-100 flex-col gap-3.5"
    >
      {error && (
        <div
          role="alert"
          className="border-destructive bg-destructive-subtle text-destructive rounded-lg border px-4 py-3 text-base"
        >
          {error}
        </div>
      )}

      <FxField data-invalid={Boolean(form.formState.errors.email) || undefined}>
        <FxLabel htmlFor="reset-email" className="block leading-normal">
          {SIGN_IN.email.label}
        </FxLabel>
        <FxInput
          id="reset-email"
          type="email"
          autoComplete="email"
          placeholder={SIGN_IN.email.placeholder}
          aria-invalid={Boolean(form.formState.errors.email) || undefined}
          {...form.register('email')}
        />
        <FxFieldError errors={[form.formState.errors.email]} />
      </FxField>

      <FxButton
        type="submit"
        className="text-md mt-1.5 h-11 w-full rounded-lg px-4"
        disabled={pending}
      >
        {pending ? 'Sending…' : FORGOT_PASSWORD.submit}
      </FxButton>

      <Link
        href="/sign-in"
        className="text-primary-accent hover:text-primary self-start text-base font-semibold"
      >
        {FORGOT_PASSWORD.back}
      </Link>
    </form>
  )
}
