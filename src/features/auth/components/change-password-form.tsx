'use client'

import { NAV_ICONS } from '@/components/layout/nav-icons'
import {
  FxAlert,
  FxButton,
  FxCard,
  FxCardContent,
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { changePassword } from '../actions'
import { CHANGE_PASSWORD } from '../data'
import { changePasswordSchema, type ChangePasswordInput } from '../schemas'
import { encodePassword } from '@/lib/password-encoding'

type Org = {
  org: string
}

export function ChangePasswordForm({ org }: Org) {
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState({
    current: false,
    password: false,
    confirm: false,
  })
  const [pending, startTransition] = useTransition()

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onTouched',
    defaultValues: { current: '', password: '', confirm: '' },
  })

  const submit = form.handleSubmit((values) => {
    setError(null)
    startTransition(async () => {
      const result = await changePassword(
        encodePassword(values.current),
        encodePassword(values.password),
        encodePassword(values.confirm)
      )
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error ?? 'An error occurred')
        return
      }
      toast.success('Password updated successfully')

      form.reset({ current: '', password: '', confirm: '' })
    })
  })

  const { errors } = form.formState

  const fields = [
    {
      name: 'current',
      id: 'current-password',
      label: CHANGE_PASSWORD.current,
      autoComplete: 'current-password',
    },
    {
      name: 'password',
      id: 'new-password',
      label: CHANGE_PASSWORD.next,
      autoComplete: 'new-password',
    },
    {
      name: 'confirm',
      id: 'confirm-new-password',
      label: CHANGE_PASSWORD.confirm,
      autoComplete: 'new-password',
    },
  ] as const
  const backNav = CHANGE_PASSWORD.back.href(org)

  return (
    <FxCard>
      <FxCardContent className="flex flex-col gap-3.5 p-5">
        <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
          {error && (
            <FxAlert role="alert" tone="destructive" className="font-medium">
              {error}
            </FxAlert>
          )}

          {fields.map((field) => (
            <FxField
              key={field.name}
              data-invalid={Boolean(errors[field.name]) || undefined}
            >
              <FxLabel htmlFor={field.id} className="block leading-normal">
                {field.label}
              </FxLabel>
              <div className="relative">
                <FxInput
                  id={field.id}
                  type={showPassword[field.name] ? 'text' : 'password'}
                  inputSize="sm"
                  autoComplete={field.autoComplete}
                  placeholder="••••••••"
                  aria-invalid={Boolean(errors[field.name]) || undefined}
                  className="pr-10"
                  {...form.register(field.name)}
                />

                <FxButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    setShowPassword((prev) => ({
                      ...prev,
                      [field.name]: !prev[field.name],
                    }))
                  }
                  className="text-muted-foreground hover:text-foreground absolute top-1.5 right-1 bg-transparent hover:bg-transparent"
                  aria-label={
                    showPassword[field.name] ? 'Hide password' : 'Show password'
                  }
                >
                  {showPassword[field.name] ? (
                    <NAV_ICONS.eye className="text-primary size-4.25" />
                  ) : (
                    <NAV_ICONS.eyeOff className="text-primary size-4.25" />
                  )}
                </FxButton>
              </div>
              <FxFieldError errors={[errors[field.name]]} />
            </FxField>
          ))}

          <div className="mt-1 flex justify-end gap-2">
            <FxButton
              type="button"
              asChild
              className="border-border bg-muted text-foreground hover:border-border-strong hover:bg-muted"
            >
              <Link href={backNav}>{CHANGE_PASSWORD.cancel}</Link>
            </FxButton>
            <FxButton type="submit" disabled={pending}>
              {pending ? 'Saving…' : CHANGE_PASSWORD.submit}
            </FxButton>
          </div>
        </form>
      </FxCardContent>
    </FxCard>
  )
}
