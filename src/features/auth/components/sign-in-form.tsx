'use client'

import { clearLogoutNotification } from '@/components/common/tab-session-sync'
import { NAV_ICONS } from '@/components/layout/nav-icons'
import {
  FxButton,
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx/index'
import { encodePassword } from '@/lib/password-encoding'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { signInAsDemo, signInWithPassword } from '../actions'
import { SIGN_IN } from '../data'
import { signInSchema, type SignInInput } from '../schemas'

export function SignInForm({ initialError }: { initialError?: string }) {
  const [pending, startTransition] = useTransition()
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    clearLogoutNotification()
  }, [])

  useEffect(() => {
    if (initialError) {
      toast.error(initialError)
    }
  }, [initialError])

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  })
  const router = useRouter()

  const hasErrors = Object.keys(form.formState.errors).length > 0

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string; redirectTo?: string }>
  ) => {
    startTransition(async () => {
      try {
        const result = await fn()
        if (!result.ok) {
          toast.error(result.error ?? 'An error occurred')
          return
        }
        toast.success('Logged in successfully')
        if (result.redirectTo) {
          router.push(result.redirectTo)
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Something went wrong.'
        )
      }
    })
  }

  return (
    <>
      <h1 className="mb-2 text-5xl leading-normal font-semibold">
        {SIGN_IN.title}
      </h1>
      <p className="text-muted-foreground mb-8 text-lg leading-normal">
        {SIGN_IN.subtitle}
      </p>

      <form
        className="flex w-full flex-col gap-2"
        noValidate
        onSubmit={form.handleSubmit((values) =>
          run(() =>
            signInWithPassword(values.email, encodePassword(values.password))
          )
        )}
      >
        <FxField
          data-invalid={Boolean(form.formState.errors.email) || undefined}
        >
          <FxLabel htmlFor="email" className="block leading-normal">
            {SIGN_IN.email.label}
          </FxLabel>
          <FxInput
            id="email"
            type="email"
            autoComplete="email"
            placeholder={SIGN_IN.email.placeholder}
            aria-invalid={Boolean(form.formState.errors.email) || undefined}
            {...form.register('email')}
          />
          <FxFieldError errors={[form.formState.errors.email]} />
        </FxField>

        <FxField
          data-invalid={Boolean(form.formState.errors.password) || undefined}
        >
          <FxLabel htmlFor="password" className="block leading-normal">
            {SIGN_IN.password.label}
          </FxLabel>

          <div className="relative">
            <FxInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
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
              onClick={() => setShowPassword((prev) => !prev)}
              className="text-muted-foreground hover:text-foreground absolute top-1.5 right-1 bg-transparent hover:bg-transparent"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <NAV_ICONS.eye className="text-primary size-4.25" />
              ) : (
                <NAV_ICONS.eyeOff className="text-primary size-4.25" />
              )}
            </FxButton>
          </div>

          <FxFieldError errors={[form.formState.errors.password]} />
        </FxField>

        <FxButton
          type="submit"
          className="text-md mt-1.5 h-11 w-full rounded-lg px-4"
          disabled={pending || hasErrors}
        >
          {pending ? 'Signing in…' : SIGN_IN.submit}
        </FxButton>

        <div className="my-1.5 flex items-center gap-3">
          <div className="bg-border h-px flex-1" />
          <span className="text-subtle-foreground text-[12px]">
            {SIGN_IN.divider}
          </span>
          <div className="bg-border h-px flex-1" />
        </div>

        <FxButton
          type="button"
          variant="outline"
          className="bg-card text-md h-11 w-full rounded-lg px-4"
          disabled={pending}
          onClick={() => run(signInAsDemo)}
        >
          <NAV_ICONS.zap className="text-primary size-4.25" strokeWidth={1.7} />
          {SIGN_IN.demo.label}
        </FxButton>
      </form>

      <p className="text-subtle-foreground mt-6 text-sm">{SIGN_IN.demo.note}</p>

      <div className="text-muted-foreground mt-4.5 flex flex-wrap items-center gap-2 text-base">
        {SIGN_IN.alternatives.map((alt, i) => (
          <Fragment key={alt.href}>
            {i > 0 && <span className="text-border-strong">·</span>}
            {alt.prompt && <span>{alt.prompt}</span>}
            <Link
              href={alt.href}
              className="text-primary-accent hover:text-primary font-semibold"
            >
              {alt.label}
            </Link>
          </Fragment>
        ))}
      </div>
    </>
  )
}
