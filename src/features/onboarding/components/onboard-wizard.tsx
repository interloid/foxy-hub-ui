'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, CheckIcon, MailCheck, Plus } from 'lucide-react'
import Link from 'next/link'
import {
  useFieldArray,
  useForm,
  useWatch,
  type UseFormReturn,
} from 'react-hook-form'
import { Stepper } from '@/components/shared/app/stepper'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import {
  FxButton,
  FxEmpty,
  FxEmptyDescription,
  FxEmptyHeader,
  FxEmptyMedia,
  FxEmptyTitle,
  FxField,
  FxFieldError,
  FxInput,
  FxInputGroup,
  FxInputGroupAddon,
  FxInputGroupInput,
  FxLabel,
} from '@/components/shared/fx'
import { cn } from '@/lib/utils'
import {
  BillingCycleToggle,
  type BillingCycle,
} from '@/components/shared/app/billing-cycle-toggle'
import {
  checkEmailAvailable,
  checkSlugAvailable,
  createWorkspace,
} from '../actions'
import {
  ONBOARD_ACCOUNT,
  ONBOARD_BRAND,
  ONBOARD_CONFIRM,
  ONBOARD_NAV,
  ONBOARD_PLANS,
  ONBOARD_PLANS_COPY,
  ONBOARD_STEPS,
  ONBOARD_TAKEN,
  ONBOARD_TEAM,
} from '../data'
import { STEP_FIELDS, wizardSchema, type WizardInput } from '../schemas'
import { OnboardPlanCard } from './onboard-plan-card'

type CheckState = 'idle' | 'checking' | 'free' | 'taken'

function hasError(value: unknown): boolean {
  return Array.isArray(value) ? value.some(hasError) : Boolean(value)
}

export function OnboardWizard() {
  const [step, setStep] = React.useState(0)
  const [slugState, setSlugState] = React.useState<CheckState>('idle')
  const [emailState, setEmailState] = React.useState<CheckState>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const form = useForm<WizardInput>({
    resolver: zodResolver(wizardSchema),
    mode: 'onTouched',
    defaultValues: {
      fullName: '',
      email: '',
      agencyName: '',
      slug: '',
      planId: ONBOARD_PLANS[1]!.id,
      cycle: 'monthly',
      invites: ONBOARD_TEAM.initialRows.map((row) => ({
        email: '',
        role: row.role,
      })),
    },
  })

  const invites = useFieldArray({ control: form.control, name: 'invites' })
  const planId = useWatch({ control: form.control, name: 'planId' })
  const cycle = useWatch({ control: form.control, name: 'cycle' })
  const checkSlug = async () => {
    const candidate = form.getValues('slug').trim()
    if (!candidate || !(await form.trigger('slug'))) {
      setSlugState('idle')
      return
    }
    setSlugState('checking')
    startTransition(async () => {
      const result = await checkSlugAvailable(candidate)
      if (!result.ok) {
        form.setError('slug', { message: result.error })
        setSlugState('idle')
        return
      }
      setSlugState(result.data ? 'free' : 'taken')
      if (!result.data) {
        form.setError('slug', { message: ONBOARD_TAKEN.slug })
      }
    })
  }

  const checkEmail = async () => {
    const candidate = form.getValues('email').trim()
    if (!candidate || !(await form.trigger('email'))) {
      setEmailState('idle')
      return
    }
    setEmailState('checking')
    startTransition(async () => {
      const result = await checkEmailAvailable(candidate)
      if (!result.ok) {
        form.setError('email', { message: result.error })
        setEmailState('idle')
        return
      }
      setEmailState(result.data ? 'free' : 'taken')
      if (!result.data) {
        form.setError('email', { message: ONBOARD_TAKEN.email })
      }
    })
  }

  const goNext = async () => {
    const fields = STEP_FIELDS[step]
    if (fields && fields.length > 0 && !(await form.trigger([...fields])))
      return
    if (step === 0) {
      if (emailState === 'taken') {
        form.setError('email', { message: ONBOARD_TAKEN.email })
        return
      }
      if (slugState === 'taken') {
        form.setError('slug', { message: ONBOARD_TAKEN.slug })
        return
      }
    }
    setStep((value) => value + 1)
  }

  const launch = form.handleSubmit((values) => {
    setError(null)
    startTransition(async () => {
      const result = await createWorkspace({
        fullName: values.fullName,
        email: values.email,
        agencyName: values.agencyName,
        slug: values.slug,
        planName: selectedPlan.name,
        cycle: values.cycle,
        invites: values.invites.filter((row) => row.email.length > 0),
      })
      if (!result.ok) {
        setError(result.error)
        setStep(0)
        return
      }
      setSentTo(result.data.email)
    })
  })

  const yearly = cycle === 'yearly'
  const priceOf = (plan: (typeof ONBOARD_PLANS)[number]) =>
    `$${yearly ? plan.priceYearly : plan.priceMonthly}`
  const cadence = yearly ? '/ yr' : '/ mo'
  const selectedPlan =
    ONBOARD_PLANS.find((plan) => plan.id === planId) ?? ONBOARD_PLANS[0]!

  const last = ONBOARD_STEPS.length - 1

  const errors = form.formState.errors
  const stepInvalid = (STEP_FIELDS[step] ?? []).some((field) =>
    hasError(errors[field])
  )
  const blocked =
    stepInvalid ||
    pending ||
    (step === 0 &&
      [emailState, slugState].some(
        (state) => state === 'taken' || state === 'checking'
      ))

  return (
    <div className="bg-background min-h-svh overflow-y-auto">
      <div className="animate-fx-rise mx-auto max-w-230 px-6 pt-9 pb-15">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="bg-primary text-primary-foreground flex size-7.5 shrink-0 items-center justify-center rounded-md text-[15px] font-bold">
              {ONBOARD_BRAND.mark}
            </span>
            <span className="text-[16px] font-semibold">
              {ONBOARD_BRAND.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <FxButton asChild variant="secondary" size="sm">
              <Link href="/sign-in">{ONBOARD_NAV.signInInstead}</Link>
            </FxButton>
          </div>
        </div>

        <Stepper
          steps={ONBOARD_STEPS}
          current={step}
          density="product"
          className="mb-8"
        />

        <div className="border-border bg-card shadow-panel rounded-2xl border p-7">
          {sentTo ? (
            <FxEmpty>
              <FxEmptyHeader>
                <FxEmptyMedia>
                  <MailCheck className="size-5" strokeWidth={1.8} />
                </FxEmptyMedia>
                <FxEmptyTitle>Check your email</FxEmptyTitle>
                <FxEmptyDescription>
                  We sent a sign-in link to{' '}
                  <strong className="text-foreground">{sentTo}</strong>. Open it
                  to finish creating your workspace.
                </FxEmptyDescription>
              </FxEmptyHeader>
            </FxEmpty>
          ) : (
            <>
              {error ? (
                <div
                  role="alert"
                  className="border-destructive bg-destructive-subtle text-destructive mb-5 rounded-lg border px-4 py-3 text-base"
                >
                  {error}
                </div>
              ) : null}
              {step === 0 ? (
                <>
                  <StepHeading
                    title={ONBOARD_ACCOUNT.title}
                    subtitle={ONBOARD_ACCOUNT.subtitle}
                  />
                  <div className="grid max-w-150 grid-cols-1 gap-4 min-[861px]:grid-cols-[1fr_1.3fr]">
                    <AccountField
                      id="onb-name"
                      name="fullName"
                      form={form}
                      {...ONBOARD_ACCOUNT.fields.name}
                    />
                    <AccountField
                      id="onb-email"
                      name="email"
                      type="email"
                      form={form}
                      onBlur={() => void checkEmail()}
                      onChange={() => setEmailState('idle')}
                      status={emailState === 'checking' ? 'Checking…' : null}
                      {...ONBOARD_ACCOUNT.fields.email}
                    />
                    <AccountField
                      id="onb-agency"
                      name="agencyName"
                      form={form}
                      {...ONBOARD_ACCOUNT.fields.agency}
                    />
                    <FxField
                      data-invalid={
                        Boolean(form.formState.errors.slug) || undefined
                      }
                    >
                      <OnboardLabel htmlFor="onb-slug">
                        {ONBOARD_ACCOUNT.fields.slug.label}
                      </OnboardLabel>
                      <FxInputGroup>
                        <FxInputGroupInput
                          id="onb-slug"
                          placeholder={ONBOARD_ACCOUNT.fields.slug.placeholder}
                          aria-invalid={
                            Boolean(form.formState.errors.slug) || undefined
                          }
                          aria-describedby="onb-slug-status"
                          {...form.register('slug', {
                            onBlur: () => void checkSlug(),
                            onChange: () => setSlugState('idle'),
                          })}
                        />
                        <FxInputGroupAddon
                          align="inline-end"
                          className="self-center border-l-0 py-0"
                        >
                          {ONBOARD_ACCOUNT.fields.slug.suffix}
                        </FxInputGroupAddon>
                      </FxInputGroup>
                      <p
                        id="onb-slug-status"
                        aria-live="polite"
                        className="text-success text-sm empty:hidden"
                      >
                        {slugState === 'checking' ? 'Checking…' : null}
                        {slugState === 'free' ? 'Available' : null}
                      </p>
                      <FxFieldError errors={[form.formState.errors.slug]} />
                    </FxField>
                  </div>
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                    <StepHeading
                      title={ONBOARD_PLANS_COPY.title}
                      subtitle={ONBOARD_PLANS_COPY.subtitle}
                      flush
                    />
                    <BillingCycleToggle
                      variant="product"
                      value={cycle}
                      onValueChange={(value: BillingCycle) =>
                        form.setValue('cycle', value, { shouldDirty: true })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3.5 min-[561px]:grid-cols-3">
                    {ONBOARD_PLANS.map((plan) => (
                      <OnboardPlanCard
                        key={plan.id}
                        plan={plan}
                        price={priceOf(plan)}
                        cadence={cadence}
                        selected={plan.id === planId}
                        onClick={() =>
                          form.setValue('planId', plan.id, {
                            shouldDirty: true,
                          })
                        }
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <StepHeading
                    title={ONBOARD_TEAM.title}
                    subtitle={ONBOARD_TEAM.subtitle}
                  />
                  <div className="flex max-w-150 flex-col gap-2.5">
                    {invites.fields.map((field, index) => (
                      <FxField key={field.id} className="gap-1.5">
                        <div className="flex gap-2">
                          <FxInput
                            type="email"
                            placeholder={ONBOARD_TEAM.placeholder}
                            aria-label={`Teammate ${index + 1} email`}
                            className="flex-1"
                            aria-invalid={
                              Boolean(
                                form.formState.errors.invites?.[index]?.email
                              ) || undefined
                            }
                            {...form.register(`invites.${index}.email`)}
                          />
                          <select
                            aria-label={`Teammate ${index + 1} role`}
                            className="border-border bg-muted text-md text-foreground focus-visible:border-ring cursor-pointer rounded-lg border px-[13px] py-[11px] outline-none"
                            {...form.register(`invites.${index}.role`)}
                          >
                            {ONBOARD_TEAM.roles.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                        <FxFieldError
                          errors={[
                            form.formState.errors.invites?.[index]?.email,
                          ]}
                        />
                      </FxField>
                    ))}
                    <FxButton
                      type="button"
                      variant="inset"
                      size="sm"
                      className="border-border-strong mt-0.5 h-8 self-start rounded-md text-sm"
                      onClick={() =>
                        invites.append({ email: '', role: 'Member' })
                      }
                    >
                      <Plus className="size-3.5" strokeWidth={2} />
                      {ONBOARD_TEAM.addLabel}
                    </FxButton>
                  </div>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <StepHeading
                    title={ONBOARD_CONFIRM.title}
                    subtitle={ONBOARD_CONFIRM.subtitle}
                  />
                  <div className="flex max-w-120 flex-col gap-3">
                    <div className="border-border bg-muted flex items-center justify-between rounded-[10px] border px-4 py-3.5">
                      <div>
                        <div className="text-[13.5px] font-semibold">
                          {selectedPlan.name} plan
                        </div>
                        <div className="text-subtle-foreground text-[12px]">
                          {ONBOARD_CONFIRM.trialNote(
                            `${priceOf(selectedPlan)}${yearly ? '/yr' : '/mo'}`
                          )}
                        </div>
                      </div>
                      <span className="bg-success-subtle text-success rounded-[20px] px-2.5 py-0.75 text-xs font-semibold">
                        {ONBOARD_CONFIRM.selectedLabel}
                      </span>
                    </div>
                    <div className="border-border bg-muted text-muted-foreground flex items-center gap-2.5 rounded-[10px] border px-4 py-3.5 text-base">
                      <CheckIcon
                        className="text-success size-4.25 shrink-0"
                        strokeWidth={1.8}
                      />
                      {ONBOARD_CONFIRM.readyNote}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}

          {sentTo ? null : (
            <>
              <div className="border-border mt-6.5 flex items-center justify-between gap-2.5 border-t pt-5">
                {step > 0 ? (
                  <FxButton
                    type="button"
                    variant="inset"
                    className="border-border-strong h-9.5 rounded-lg px-4 text-[13.5px] font-medium"
                    onClick={() => setStep((value) => value - 1)}
                  >
                    {ONBOARD_NAV.back}
                  </FxButton>
                ) : null}

                {step < last ? (
                  <FxButton
                    type="button"
                    className="h-9.5 rounded-lg px-5 text-[13.5px]"
                    disabled={blocked}
                    onClick={goNext}
                  >
                    {ONBOARD_NAV.next}
                  </FxButton>
                ) : (
                  <FxButton
                    type="button"
                    className="h-9.5 gap-1.75 rounded-lg px-5 text-[13.5px]"
                    disabled={blocked}
                    onClick={launch}
                  >
                    {pending ? 'Creating…' : ONBOARD_NAV.launch}
                    <ArrowRight className="size-4" strokeWidth={2} />
                  </FxButton>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StepHeading({
  title,
  subtitle,
  flush = false,
}: {
  title: string
  subtitle: string
  flush?: boolean
}) {
  return (
    <div>
      <h1 className="mb-1 text-3xl leading-normal font-semibold">{title}</h1>
      <p
        className={cn(
          'text-md text-muted-foreground',
          flush ? 'mb-0' : 'mb-5.5'
        )}
      >
        {subtitle}
      </p>
    </div>
  )
}

function OnboardLabel({
  children,
  ...props
}: React.ComponentProps<typeof FxLabel>) {
  return (
    <FxLabel {...props} className="block text-[12px] leading-normal">
      {children}
    </FxLabel>
  )
}

function AccountField({
  id,
  name,
  label,
  placeholder,
  type = 'text',
  form,
  onBlur,
  onChange,
  status,
}: {
  id: string
  name: 'fullName' | 'email' | 'agencyName'
  label: string
  placeholder: string
  type?: string
  form: UseFormReturn<WizardInput>
  onBlur?: () => void
  onChange?: () => void
  status?: React.ReactNode
}) {
  const invalid = Boolean(form.formState.errors[name]) || undefined
  const statusId = status === undefined ? undefined : `${id}-status`
  return (
    <FxField data-invalid={invalid}>
      <OnboardLabel htmlFor={id}>{label}</OnboardLabel>
      <FxInput
        id={id}
        type={type}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={statusId}
        {...form.register(name, {
          ...(onBlur ? { onBlur: () => onBlur() } : {}),
          ...(onChange ? { onChange: () => onChange() } : {}),
        })}
      />
      {statusId ? (
        <p
          id={statusId}
          aria-live="polite"
          className="text-muted-foreground text-sm empty:hidden"
        >
          {status}
        </p>
      ) : null}
      <FxFieldError errors={[form.formState.errors[name]]} />
    </FxField>
  )
}
