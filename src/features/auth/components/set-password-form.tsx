'use client'

import {
  FxButton,
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { setPassword } from '../actions'
import { setPasswordSchema, type SetPasswordInput } from '../schemas'

export function SetPasswordForm({ next }: { next: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [showDialog, setShowDialog] = useState(false)

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
      setShowDialog(true)
    })
  })

  return (
    <>
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
          className="text-md mt-1.5 h-11 w-full rounded-lg px-4"
          disabled={pending}
        >
          {pending ? 'Saving…' : 'Save password'}
        </FxButton>

        <p className="text-subtle-foreground text-sm">
          You will use this to sign in from now on. At least 8 characters.
        </p>
      </form>

      <Dialog open={showDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subscribe to the chosen plan?</DialogTitle>
            <DialogDescription>
              Do you want to subscribe to the chosen plan now?
            </DialogDescription>
          </DialogHeader>

          <p className="text-muted-foreground mt-3 text-sm">
            Note: Team invitations can only be sent after your subscription is
            completed.
          </p>

          <div className="mt-4 flex justify-end gap-3">
            <FxButton
              onClick={() => router.replace('/')}
              className="border-border bg-muted text-foreground hover:border-border-strong hover:bg-muted"
            >
              Skip
            </FxButton>

            <FxButton onClick={() => router.replace(next)}>Subscribe</FxButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
