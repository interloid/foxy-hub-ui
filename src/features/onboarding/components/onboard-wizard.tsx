'use client'

import {
  BillingCycleToggle,
  type BillingCycle,
} from '@/components/shared/app/billing-cycle-toggle'
import { Stepper } from '@/components/shared/app/stepper'
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  FxDropdownMenuContent,
  FxDropdownMenuItem,
} from '@/components/shared/fx-menu'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { env } from '@/config/env'
import { cn } from '@/lib/utils'
import { CheckEmailSkeleton } from '@/skeleton/verify-mail'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowRight,
  Check,
  CheckIcon,
  ChevronDown,
  Loader2,
  MailCheck,
  Plus,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { ComponentProps, ReactNode, useState, useTransition } from 'react'
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type UseFormReturn,
} from 'react-hook-form'
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
  const [step, setStep] = useState<number>(0)
  const [slugState, setSlugState] = useState<CheckState>('idle')
  const [emailState, setEmailState] = useState<CheckState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [checkingSlug, setCheckingSlug] = useState(false)
  const [pending, startTransition] = useTransition()

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
  const watchedInvites = useWatch({ control: form.control, name: 'invites' })

  const hasEmptyInvite = watchedInvites?.some(
    (invite) => !invite.email || invite.email.trim() === ''
  )
  const checkSlug = async () => {
    const candidate = form.getValues('slug').trim()
    if (!candidate || !(await form.trigger('slug'))) {
      setSlugState('idle')
      return
    }
    setSlugState('checking')
    setCheckingSlug(true)
    try {
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
    } finally {
      setCheckingSlug(false)
    }
  }

  const checkEmail = async () => {
    const candidate = form.getValues('email').trim()
    if (!candidate || !(await form.trigger('email'))) {
      setEmailState('idle')
      return
    }
    setEmailState('checking')
    setCheckingEmail(true)
    try {
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
    } finally {
      setCheckingEmail(false)
    }
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
    checkingEmail ||
    checkingSlug ||
    (step === 0 &&
      [emailState, slugState].some(
        (state) => state === 'taken' || state === 'checking'
      ))
  const domain = env.NEXT_PUBLIC_APP_DOMAIN ?? 'yourdomain.com'

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
            <FxButton asChild variant="secondary" size="default">
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

        <div className="border-border bg-card shadow-panel rounded-2xl border p-3 sm:p-7">
          {pending ? (
            /* 1. Show Skeleton ONLY while launching workspace */
            <CheckEmailSkeleton />
          ) : sentTo ? (
            /* 2. Show Success Check Email state */
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
            /* 3. Show Onboarding Form Steps */
            <>
              {error && (
                <div
                  role="alert"
                  className="border-destructive bg-destructive-subtle text-destructive mb-5 rounded-lg border px-4 py-3 text-base"
                >
                  {error}
                </div>
              )}
              {step === 0 && (
                <>
                  <StepHeading
                    title={ONBOARD_ACCOUNT.title}
                    subtitle={ONBOARD_ACCOUNT.subtitle}
                  />
                  <div className="grid w-full grid-cols-1 gap-x-4 gap-y-2 min-[861px]:grid-cols-[1fr_1fr]">
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

                      <FxInputGroup className="ring-0 ring-offset-0 focus-within:ring-0 focus-within:ring-offset-0 has-aria-invalid:ring-0 has-aria-invalid:ring-offset-0 aria-invalid:ring-0">
                        <FxInputGroupAddon
                          align="inline-start"
                          className="text-muted-foreground self-center border-r-0 py-0 select-none"
                        >
                          {domain}/
                        </FxInputGroupAddon>

                        <FxInputGroupInput
                          id="onb-slug"
                          placeholder={ONBOARD_ACCOUNT.fields.slug.placeholder}
                          aria-invalid={
                            Boolean(form.formState.errors.slug) || undefined
                          }
                          className="outline-none focus-visible:ring-0 focus-visible:ring-offset-0 aria-invalid:ring-0 aria-invalid:ring-offset-0"
                          {...form.register('slug', {
                            onBlur: () => void checkSlug(),
                            onChange: () => setSlugState('idle'),
                          })}
                        />

                        {(checkingSlug || slugState === 'free') && (
                          <FxInputGroupAddon
                            align="inline-end"
                            className="border-none pr-3 select-none"
                          >
                            {checkingSlug ? (
                              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                            ) : slugState === 'free' ? (
                              <Check className="text-success h-4 w-4" />
                            ) : null}
                          </FxInputGroupAddon>
                        )}
                      </FxInputGroup>

                      <FxFieldError errors={[form.formState.errors.slug]} />
                    </FxField>
                  </div>
                </>
              )}

              {step === 1 && (
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
                  <div className="dash:grid-cols-3 grid grid-cols-1 gap-3.5">
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
              )}

              {step === 2 && (
                <>
                  <StepHeading
                    title={ONBOARD_TEAM.title}
                    subtitle={ONBOARD_TEAM.subtitle}
                  />
                  <div className="flex w-full flex-col gap-2.5">
                    {invites.fields.map((field, index) => (
                      <FxField key={field.id} className="gap-1.5">
                        <div className="flex w-full items-center gap-1.5 sm:gap-2">
                          <FxInput
                            type="email"
                            placeholder={ONBOARD_TEAM.placeholder}
                            aria-label={`Teammate ${index + 1} email`}
                            className="min-w-0 flex-1 text-xs sm:text-sm"
                            aria-invalid={
                              Boolean(
                                form.formState.errors.invites?.[index]?.email
                              ) || undefined
                            }
                            {...form.register(`invites.${index}.email`)}
                          />

                          <Controller
                            control={form.control}
                            name={`invites.${index}.role`}
                            render={({ field: roleField }) => (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <FxButton
                                    type="button"
                                    variant="secondary"
                                    size="default"
                                    /* Replaced flex-1 with a clean fixed width */
                                    className="w-19 shrink-0 justify-between px-2 text-xs font-medium sm:w-28 sm:px-3 sm:text-sm"
                                  >
                                    <span className="truncate">
                                      {roleField.value || 'Select role'}
                                    </span>
                                    <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                                  </FxButton>
                                </DropdownMenuTrigger>
                                <FxDropdownMenuContent
                                  align="end"
                                  /* Set menu width independently so open items have plenty of room */
                                  className="w-32 min-w-32"
                                >
                                  {ONBOARD_TEAM.roles.map((option) => {
                                    const isSelected =
                                      roleField.value === option

                                    return (
                                      <FxDropdownMenuItem
                                        key={option}
                                        onClick={() =>
                                          roleField.onChange(option)
                                        }
                                        className={cn(
                                          'cursor-pointer text-xs sm:text-sm',
                                          isSelected &&
                                            'bg-primary/10 text-primary font-semibold'
                                        )}
                                      >
                                        {option}
                                      </FxDropdownMenuItem>
                                    )
                                  })}
                                </FxDropdownMenuContent>
                              </DropdownMenu>
                            )}
                          />

                          <FxButton
                            type="button"
                            variant="destructive"
                            size="xs"
                            disabled={invites.fields.length <= 1}
                            className="text-destructive hover:bg-destructive/10 size-3 shrink-0 bg-transparent p-0 sm:size-9"
                            onClick={() => invites.remove(index)}
                            aria-label={`Remove teammate ${index + 1}`}
                          >
                            <Trash2 className="size-4" />
                          </FxButton>
                        </div>

                        <FxFieldError
                          errors={[
                            form.formState.errors.invites?.[index]?.email,
                          ]}
                        />
                      </FxField>
                    ))}

                    {/* Add Teammate Button */}
                    <FxButton
                      type="button"
                      size="sm"
                      disabled={
                        hasEmptyInvite ||
                        Object.keys(form.formState.errors).length > 0
                      }
                      className="border-border-strong mt-0.5 h-10 self-start rounded-md text-sm"
                      onClick={() =>
                        invites.append({ email: '', role: 'Member' })
                      }
                    >
                      <Plus className="size-3.5" strokeWidth={2} />
                      {ONBOARD_TEAM.addLabel}
                    </FxButton>
                  </div>
                </>
              )}

              {step === 3 && (
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
              )}
            </>
          )}

          {/* Hide bottom navigation bar during pending or sentTo states */}
          {!sentTo && !pending && (
            <div className="border-border mt-6.5 flex items-center justify-between gap-2.5 border-t pt-5">
              {step > 0 && (
                <FxButton
                  type="button"
                  className="bg-muted text-foreground border-border-strong hover:bg-muted h-9.5 rounded-lg px-4 text-[13.5px] font-medium"
                  onClick={() => setStep((value) => value - 1)}
                >
                  {ONBOARD_NAV.back}
                </FxButton>
              )}

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
                  {ONBOARD_NAV.launch}
                  <ArrowRight className="size-4" strokeWidth={2} />
                </FxButton>
              )}
            </div>
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

function OnboardLabel({ children, ...props }: ComponentProps<typeof FxLabel>) {
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
  status?: ReactNode
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
      {statusId && (
        <p
          id={statusId}
          aria-live="polite"
          className="text-muted-foreground text-sm empty:hidden"
        >
          {status}
        </p>
      )}
      <FxFieldError errors={[form.formState.errors[name]]} />
    </FxField>
  )
}
