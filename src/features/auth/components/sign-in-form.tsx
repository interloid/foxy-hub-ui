'use client'

import * as React from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useForm } from 'react-hook-form'

import { NAV_ICONS } from '@/components/layout/nav-icons'
import {
  FxButton,
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx/index'

import { toast } from 'sonner'
import { signInAsDemo, signInWithPassword } from '../actions'
import { SIGN_IN } from '../data'
import { signInSchema, type SignInInput } from '../schemas'

export function SignInForm({ initialError }: { initialError?: string }) {
  const [error, setError] = React.useState<string | null>(initialError ?? null)
  const [pending, startTransition] = React.useTransition()

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  })

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      // A successful sign-in redirects server-side and never returns.
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.')
        toast.error(error)
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
        className="flex max-w-100 flex-col gap-3.5"
        noValidate
        onSubmit={form.handleSubmit((values) =>
          run(() => signInWithPassword(values.email, values.password))
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
          <FxInput
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(form.formState.errors.password) || undefined}
            {...form.register('password')}
          />
          <FxFieldError errors={[form.formState.errors.password]} />
        </FxField>

        <FxButton
          type="submit"
          size="block"
          className="mt-1.5"
          disabled={pending}
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
          size="block"
          className="bg-card"
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
          <React.Fragment key={alt.href}>
            {i > 0 && <span className="text-border-strong">·</span>}
            {alt.prompt ? <span>{alt.prompt}</span> : null}
            <Link
              href={alt.href}
              className="text-primary-accent hover:text-primary font-semibold"
            >
              {alt.label}
            </Link>
          </React.Fragment>
        ))}
      </div>
    </>
  )
}
