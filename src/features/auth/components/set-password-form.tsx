'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import {
  FxButton,
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx'
import { setPassword } from '../actions'
import { setPasswordSchema, type SetPasswordInput } from '../schemas'

export function SetPasswordForm({ next }: { next: string }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const form = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    mode: 'onTouched',
    defaultValues: { password: '', confirm: '' },
  })

  const submit = form.handleSubmit((values) => {
    setError(null)
    startTransition(async () => {
      const result = await setPassword(values.password, values.confirm)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.replace(next)
    })
  })

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex max-w-100 flex-col gap-3.5"
    >
      {error ? (
        <div
          role="alert"
          className="border-destructive bg-destructive-subtle text-destructive rounded-lg border px-4 py-3 text-base"
        >
          {error}
        </div>
      ) : null}

      <FxField
        data-invalid={Boolean(form.formState.errors.password) || undefined}
      >
        <FxLabel htmlFor="new-password" className="block leading-normal">
          New password
        </FxLabel>
        <FxInput
          id="new-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(form.formState.errors.password) || undefined}
          {...form.register('password')}
        />
        <FxFieldError errors={[form.formState.errors.password]} />
      </FxField>

      <FxField
        data-invalid={Boolean(form.formState.errors.confirm) || undefined}
      >
        <FxLabel htmlFor="confirm-password" className="block leading-normal">
          Confirm password
        </FxLabel>
        <FxInput
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(form.formState.errors.confirm) || undefined}
          {...form.register('confirm')}
        />
        <FxFieldError errors={[form.formState.errors.confirm]} />
      </FxField>

      <FxButton
        type="submit"
        size="block"
        className="mt-1.5"
        disabled={pending}
      >
        {pending ? 'Saving…' : 'Save password'}
      </FxButton>

      <p className="text-subtle-foreground text-sm">
        You will use this to sign in from now on. At least 8 characters.
      </p>
    </form>
  )
}
