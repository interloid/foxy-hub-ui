'use client'

import {
  FxField,
  FxFieldError,
  FxInput,
  FxLabel,
} from '@/components/shared/fx-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormatter } from '@/context/locale-provider'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import { getCurrencySymbol } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  Controller,
  useFormContext,
  type FieldError,
  useWatch,
} from 'react-hook-form'
import {
  FieldHint,
  labelClass,
  preventNegativeInput,
  selectTriggerClass,
} from './form-fields'
import { useNewProjectData } from './new-project-data-context'
import {
  readAmount,
  type AllocationValues,
  type BillingModel,
  type BillingStepValues,
  type NewProjectWizardValues,
} from './schema'

const BILLING_MODELS: {
  id: BillingModel
  title: string
  subtitle: string
  dotClass: string
  selectedClass: string
  titleClass: string
}[] = [
  {
    id: 'contract',
    title: 'Contract value',
    subtitle: 'Fixed total, invoiced by draw',
    dotClass: 'bg-success',
    selectedClass: 'border-success bg-success/10',
    titleClass: 'text-success',
  },
  {
    id: 'budget',
    title: 'Budget-based',
    subtitle: 'Hours × bill rate, capped',
    dotClass: 'bg-primary',
    selectedClass: 'border-primary bg-primary/10',
    titleClass: 'text-primary',
  },
  {
    id: 'hourly',
    title: 'Hourly',
    subtitle: 'Hours × bill rate, no cap',
    dotClass: 'bg-info',
    selectedClass: 'border-info bg-info/10',
    titleClass: 'text-info',
  },
  {
    id: 'retainer',
    title: 'Retainer',
    subtitle: 'Periodic fee + hour bucket',
    dotClass: 'bg-warning',
    selectedClass: 'border-warning bg-warning/10',
    titleClass: 'text-warning',
  },
]

const numberInputClass = 'h-10 font-mono text-[13px]'

type AmountFieldName = Exclude<
  keyof BillingStepValues,
  'model' | 'retainerPeriod'
>

function AmountField({
  name,
  label,
  placeholder,
  hint,
  error,
  step = '0.01',
}: {
  name: AmountFieldName
  label: string
  placeholder: string
  hint?: string
  error?: FieldError
  step?: string
}) {
  const { register } = useFormContext<NewProjectWizardValues>()

  return (
    <FxField
      data-invalid={Boolean(error) || undefined}
      className={!error && hint ? 'pb-0' : undefined}
    >
      <FxLabel htmlFor={name} className={labelClass}>
        {label}
      </FxLabel>
      <FxInput
        id={name}
        type="number"
        min={0}
        step={step}
        inputMode="decimal"
        placeholder={placeholder}
        onKeyDown={preventNegativeInput}
        className={numberInputClass}
        aria-invalid={Boolean(error) || undefined}
        {...register(`billing.${name}`)}
      />
      {error ? (
        <FxFieldError errors={[error]} />
      ) : (
        hint && <FieldHint>{hint}</FieldHint>
      )}
    </FxField>
  )
}

function BillingSummary({
  values,
  allocations,
}: {
  values: BillingStepValues
  allocations: AllocationValues[]
}) {
  const fmt = useFormatter()
  const { currency } = useWorkspace()
  const { members, roundingMinutes } = useNewProjectData()

  // "(Marcus at $120/hr, Priya at $140/hr)" - one entry per teammate with a bill rate.
  const seen = new Set<string>()
  const rateList = allocations
    .flatMap((row) => {
      const rate = readAmount(row.billRate)
      const member = members.find((m) => m.id === row.memberId)
      if (!member || !rate || Number.isNaN(rate) || seen.has(member.id)) {
        return []
      }
      seen.add(member.id)
      return `${member.name.split(' ')[0]} at ${fmt.currency(rate, currency)}/hr`
    })
    .join(', ')
  const roundingNote = `Approved hours × each person's bill rate${
    rateList ? ` (${rateList})` : ''
  }, rounded up to the nearest ${roundingMinutes} min at invoicing.`

  const money = (raw?: string) => {
    const amount = readAmount(raw)
    return fmt.currency(
      amount !== undefined && !Number.isNaN(amount) ? amount : 0,
      currency
    )
  }

  let text: string
  switch (values.model) {
    case 'contract': {
      const hours = readAmount(values.estimatedHours)
      text = `A fixed total of ${money(values.contractValue)}, invoiced in draws. Hours are tracked${
        hours ? ` against an estimate of ${hours} h` : ''
      } to show margin, but never billed.`
      break
    }
    case 'budget':
      text = `${roundingNote} Capped at a budget of ${money(values.budgetCap)} - going past it is allowed but flagged as overage on the invoice.`
      break
    case 'hourly':
      text = `${roundingNote} There is no cap - every approved hour is billed.`
      break
    case 'retainer': {
      const period = values.retainerPeriod === 'weekly' ? 'week' : 'month'
      const hours = readAmount(values.retainerHours) || 0
      const overage = readAmount(values.retainerOverage)
      text = `${money(values.retainerFee)} per ${period} covers a bucket of ${hours} h.${
        overage && !Number.isNaN(overage)
          ? ` Hours past the bucket bill at ${overage}× each person's bill rate.`
          : ' No overage multiplier is set.'
      }`
      break
    }
  }

  return (
    <div className="border-warning/40 bg-warning/10 rounded-lg border p-3.5">
      <p className="text-warning mb-1 text-[11px] font-semibold tracking-wider uppercase">
        What this bills
      </p>
      <p className="text-foreground text-[13px] leading-relaxed">{text}</p>
    </div>
  )
}

export function BillingStep() {
  const {
    control,
    formState: { errors },
  } = useFormContext<NewProjectWizardValues>()
  const { currency } = useWorkspace()
  const symbol = getCurrencySymbol(currency)

  const billing = useWatch({ control, name: 'billing' })
  const allocations = useWatch({ control, name: 'team.allocations' })
  const billingErrors = errors.billing

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className={cn(labelClass, 'text-foreground')}>Engagement model</p>
        <Controller
          control={control}
          name="billing.model"
          render={({ field }) => (
            <div
              role="radiogroup"
              aria-label="Engagement model"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {BILLING_MODELS.map((model) => {
                const isSelected = field.value === model.id
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => field.onChange(model.id)}
                    className={cn(
                      'border-border bg-muted/60 hover:bg-muted flex cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      isSelected && model.selectedClass
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn('size-2 rounded-full', model.dotClass)}
                      />
                      <span
                        className={cn(
                          'text-foreground text-[13px] font-semibold',
                          isSelected && model.titleClass
                        )}
                      >
                        {model.title}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {model.subtitle}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        />
      </div>

      {billing.model === 'contract' && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
          <AmountField
            name="contractValue"
            label={`Contract value (${symbol})`}
            placeholder="24000"
            error={billingErrors?.contractValue}
          />
          <AmountField
            name="estimatedHours"
            label="Estimated hours"
            placeholder="160"
            step="0.5"
            hint="Tracked against the fee for margin, never billed."
            error={billingErrors?.estimatedHours}
          />
        </div>
      )}

      {billing.model === 'budget' && (
        <AmountField
          name="budgetCap"
          label={`Budget cap (${symbol})`}
          placeholder="24000"
          hint="Hours bill against this. Going past it is allowed, but the invoice and the log both flag the overage."
          error={billingErrors?.budgetCap}
        />
      )}

      {billing.model === 'retainer' && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
          <AmountField
            name="retainerFee"
            label={`Retainer fee (${symbol})`}
            placeholder="6000"
            error={billingErrors?.retainerFee}
          />
          <FxField>
            <FxLabel htmlFor="retainerPeriod" className={labelClass}>
              Billing period
            </FxLabel>
            <Controller
              control={control}
              name="billing.retainerPeriod"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="retainerPeriod"
                    className={selectTriggerClass}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="start"
                    sideOffset={6}
                    className="p-1"
                  >
                    <SelectItem
                      value="monthly"
                      className="cursor-pointer p-2 text-[13px]"
                    >
                      Monthly
                    </SelectItem>
                    <SelectItem
                      value="weekly"
                      className="cursor-pointer p-2 text-[13px]"
                    >
                      Weekly
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FxField>
          <AmountField
            name="retainerHours"
            label="Bucket hours per period"
            placeholder="40"
            step="0.5"
            error={billingErrors?.retainerHours}
          />
          <AmountField
            name="retainerOverage"
            label="Overage multiplier (×)"
            placeholder="1.5"
            hint="Applied to each person's bill rate for hours past the bucket."
            error={billingErrors?.retainerOverage}
          />
        </div>
      )}

      <BillingSummary values={billing} allocations={allocations} />
    </div>
  )
}
