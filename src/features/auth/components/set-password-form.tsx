'use client'

import { NAV_ICONS } from '@/components/layout/nav-icons'
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
import { encodePassword } from '@/lib/password-encoding'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { setPassword } from '../actions'
import { setPasswordSchema, type SetPasswordInput } from '../schemas'

interface SetPasswordFormProps {
  next: string
  isReset?: boolean
  forgot?: string
}

export function SetPasswordForm({
  next,
  isReset = false,
  forgot,
}: SetPasswordFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showDialog, setShowDialog] = useState(false)
  const [showPassword, setShowPassword] = useState({
    password: false,
    confirm: false,
  })

  const form = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    mode: 'onTouched',
    defaultValues: { password: '', confirm: '' },
  })

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      console.log(values)
      const result = await setPassword(
        encodePassword(values.password),
        encodePassword(values.confirm)
      )
      if (!result.ok) {
        toast.error(result.error)

        return
      }

      if (result.role === 'owner' && !isReset && !forgot) {
        setShowDialog(true)
      } else {
        router.replace('/')
      }
    })
  })

  return (
    <>
      <form onSubmit={submit} noValidate className="flex w-full flex-col gap-2">
        <FxField
          data-invalid={Boolean(form.formState.errors.password) || undefined}
        >
          <FxLabel htmlFor="new-password" className="block leading-normal">
            New password
          </FxLabel>

          <div className="relative">
            <FxInput
              id="new-password"
              type={showPassword.password ? 'text' : 'password'}
              autoComplete="new-password"
              aria-invalid={
                Boolean(form.formState.errors.password) || undefined
              }
              className="pr-10"
              {...form.register('password')}
            />

            <FxButton
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                setShowPassword((prev) => ({
                  ...prev,
                  password: !prev.password,
                }))
              }
              className="text-muted-foreground hover:text-foreground absolute top-1.5 right-1 bg-transparent hover:bg-transparent"
              aria-label={
                showPassword.password ? 'Hide password' : 'Show password'
              }
            >
              {showPassword.password ? (
                <NAV_ICONS.eye className="text-primary size-4.25" />
              ) : (
                <NAV_ICONS.eyeOff className="text-primary size-4.25" />
              )}
            </FxButton>
          </div>

          <FxFieldError errors={[form.formState.errors.password]} />
        </FxField>

        <FxField
          data-invalid={Boolean(form.formState.errors.confirm) || undefined}
        >
          <FxLabel htmlFor="confirm-password" className="block leading-normal">
            Confirm password
          </FxLabel>

          <div className="relative">
            <FxInput
              id="confirm-password"
              type={showPassword.confirm ? 'text' : 'password'}
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.confirm) || undefined}
              className="pr-10"
              {...form.register('confirm')}
            />

            <FxButton
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                setShowPassword((prev) => ({
                  ...prev,
                  confirm: !prev.confirm,
                }))
              }
              className="text-muted-foreground hover:text-foreground absolute top-1.5 right-1 bg-transparent hover:bg-transparent"
              aria-label={
                showPassword.confirm
                  ? 'Hide confirm password'
                  : 'Show confirm password'
              }
            >
              {showPassword.confirm ? (
                <NAV_ICONS.eye className="text-primary size-4.25" />
              ) : (
                <NAV_ICONS.eyeOff className="text-primary size-4.25" />
              )}
            </FxButton>
          </div>

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
