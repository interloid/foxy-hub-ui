import { z } from 'zod'

export const updateCadenceSchema = z.enum([
  'weekly_monday',
  'weekly_friday',
  'fortnightly',
  'at_milestone',
  'on_request',
])

export type UpdateCadence = z.infer<typeof updateCadenceSchema>

export const UPDATE_CADENCE_OPTIONS: { value: UpdateCadence; label: string }[] =
  [
    { value: 'weekly_monday', label: 'Weekly, Monday' },
    { value: 'weekly_friday', label: 'Weekly, Friday' },
    { value: 'fortnightly', label: 'Fortnightly' },
    { value: 'at_milestone', label: 'At each milestone' },
    { value: 'on_request', label: 'On request only' },
  ]

// Select value for "Not decided yet" - Radix Select can't use an empty string. Sent to
// the server as null (`projects.sign_off_by`).
export const NO_SIGN_OFF = 'none'

const MILESTONE_HOURS_MAX = 10_000

// Each step is its own object so `trigger('basics')` / `trigger('scope')` validates one
// step at a time, and a step's refinements run even while later steps are still empty.
export const basicsStepSchema = z
  .object({
    projectName: z
      .string()
      .trim()
      .min(2, 'Project name must be at least 2 characters')
      .max(100, 'Project name must be 100 characters or less'),
    clientId: z.string().optional(),
    ownerId: z.string().optional(),
    kickoffDate: z.date().optional(),
    targetEndDate: z.date().optional(),
  })
  .refine(
    (data) =>
      !data.kickoffDate ||
      !data.targetEndDate ||
      data.targetEndDate >= data.kickoffDate,
    {
      path: ['targetEndDate'],
      message: 'Target end date must be on or after the kickoff date',
    }
  )

export const milestoneSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name this milestone')
    .max(150, 'Milestone name must be 150 characters or less'),
  dueDate: z.date().optional(),
  estimatedHours: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (!v || v.trim() === '') return true
        const n = Number(v)
        return Number.isFinite(n) && n > 0 && n <= MILESTONE_HOURS_MAX
      },
      { message: 'Enter hours between 0 and 10,000' }
    ),
  clientVisible: z.boolean(),
})

export const scopeStepSchema = z.object({
  inScope: z.string().max(2000, 'Keep this under 2,000 characters').optional(),
  outOfScope: z
    .string()
    .max(2000, 'Keep this under 2,000 characters')
    .optional(),
  doneWhen: z.string().max(300, 'Keep this under 300 characters').optional(),
  // The sign-off person's NAME - `projects.sign_off_by` is text, as there is no client
  // contacts table to reference.
  signOffBy: z.string().max(150),
  updateCadence: updateCadenceSchema,
  milestones: z.array(milestoneSchema).min(1, 'Add at least one milestone'),
})

export const billingModelSchema = z.enum([
  'contract',
  'budget',
  'hourly',
  'retainer',
])
export type BillingModel = z.infer<typeof billingModelSchema>

export const retainerPeriodSchema = z.enum(['monthly', 'weekly'])
export type RetainerPeriod = z.infer<typeof retainerPeriodSchema>

// Match the column precisions: contract_value numeric(12,2), retainer_hours numeric(6,2),
// estimated_hours numeric(8,2), retainer_overage numeric(4,2).
const MONEY_MAX = 9_999_999_999.99
const BUCKET_HOURS_MAX = 9_999.99
const ESTIMATED_HOURS_MAX = 999_999.99
const MULTIPLIER_MAX = 99.99

// Numeric inputs stay strings in the form; empty means "not entered".
export function readAmount(raw?: string): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : NaN
}

function checkAmount(
  ctx: z.RefinementCtx,
  path: string,
  raw: string | undefined,
  { label, required, max }: { label: string; required: boolean; max: number }
) {
  const value = readAmount(raw)

  if (value === undefined) {
    if (required) {
      ctx.addIssue({
        code: 'custom',
        path: [path],
        message: `${label} is required`,
      })
    }
    return
  }

  if (Number.isNaN(value)) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: `${label} must be a number`,
    })
  } else if (value <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: `${label} must be more than 0`,
    })
  } else if (value > max) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: `${label} is too large`,
    })
  }
}

// Every model's fields live in one object; only the selected model's fields are checked,
// so switching models never leaves hidden fields blocking "Next".
export const billingStepSchema = z
  .object({
    model: billingModelSchema,
    contractValue: z.string().optional(),
    estimatedHours: z.string().optional(),
    budgetCap: z.string().optional(),
    retainerFee: z.string().optional(),
    retainerPeriod: retainerPeriodSchema,
    retainerHours: z.string().optional(),
    // A multiplier on the bill rate (1.5 = time and a half), not a money amount -
    // `projects.retainer_overage` is numeric(4,2).
    retainerOverage: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    switch (data.model) {
      case 'contract':
        checkAmount(ctx, 'contractValue', data.contractValue, {
          label: 'Contract value',
          required: true,
          max: MONEY_MAX,
        })
        checkAmount(ctx, 'estimatedHours', data.estimatedHours, {
          label: 'Estimated hours',
          required: false,
          max: ESTIMATED_HOURS_MAX,
        })
        break
      case 'budget':
        checkAmount(ctx, 'budgetCap', data.budgetCap, {
          label: 'Budget cap',
          required: true,
          max: MONEY_MAX,
        })
        break
      case 'retainer':
        checkAmount(ctx, 'retainerFee', data.retainerFee, {
          label: 'Retainer fee',
          required: true,
          max: MONEY_MAX,
        })
        checkAmount(ctx, 'retainerHours', data.retainerHours, {
          label: 'Bucket hours',
          required: true,
          max: BUCKET_HOURS_MAX,
        })
        checkAmount(ctx, 'retainerOverage', data.retainerOverage, {
          label: 'Overage multiplier',
          required: false,
          max: MULTIPLIER_MAX,
        })
        break
      case 'hourly':
        break
    }
  })

export const allocationSchema = z
  .object({
    memberId: z.string().min(1, 'Pick a teammate'),
    hoursPerDay: z.string(),
    daysPerWeek: z.string(),
    billRate: z.string().optional(),
    effectiveFrom: z.date({ error: 'Pick a start date' }),
    // undefined = follow the project's target end date (the default); null = the user cleared
    // it (open-ended); a Date = the user's own pick. See `resolveEffectiveTo`.
    effectiveTo: z.date().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    checkAmount(ctx, 'hoursPerDay', data.hoursPerDay, {
      label: 'Hours/day',
      required: true,
      max: 24,
    })
    if (
      data.effectiveTo instanceof Date &&
      data.effectiveTo <= data.effectiveFrom
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Must be after the effective from date',
      })
    }
    const hours = readAmount(data.hoursPerDay)
    if (hours !== undefined && hours > 0 && hours < 0.25) {
      ctx.addIssue({
        code: 'custom',
        path: ['hoursPerDay'],
        message: 'Hours/day must be at least 0.25',
      })
    }
    // `project_allocations.days_per_week` is a smallint between 1 and 7.
    const days = readAmount(data.daysPerWeek)
    if (days === undefined || !Number.isInteger(days) || days < 1 || days > 7) {
      ctx.addIssue({
        code: 'custom',
        path: ['daysPerWeek'],
        message: 'Days/wk must be a whole number from 1 to 7',
      })
    }
    // The bill rate stays optional - an empty rate is honest, a made-up one is not. There is
    // no cost rate here: the RPC snapshots it from `memberships`, never from the browser.
    checkAmount(ctx, 'billRate', data.billRate, {
      label: 'Bill rate',
      required: false,
      max: MONEY_MAX,
    })
  })

// The override reason is required only while someone is over-committed. That depends on
// capacity data outside the form, so the wizard checks it before creating the project.
export const teamStepSchema = z
  .object({
    allocations: z.array(allocationSchema).min(1, 'Add at least one teammate'),
    overrideReason: z.string().max(500, 'Keep this under 500 characters'),
    deliveryNotes: z
      .string()
      .max(1000, 'Keep this under 1,000 characters')
      .optional(),
  })
  .superRefine((data, ctx) => {
    // One row per teammate. The picker already hides people who are on another row; this
    // backs it up so a duplicate can never reach `project_allocations`.
    const seen = new Set<string>()
    data.allocations.forEach((row, index) => {
      if (row.memberId && seen.has(row.memberId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['allocations', index, 'memberId'],
          message: 'This teammate is already on the project',
        })
      }
      seen.add(row.memberId)
    })
  })

export const newProjectWizardSchema = z.object({
  basics: basicsStepSchema,
  scope: scopeStepSchema,
  billing: billingStepSchema,
  team: teamStepSchema,
})

export type BasicsStepValues = z.infer<typeof basicsStepSchema>
export type MilestoneValues = z.infer<typeof milestoneSchema>
export type ScopeStepValues = z.infer<typeof scopeStepSchema>
export type BillingStepValues = z.infer<typeof billingStepSchema>

// Hourly bills every approved hour at each person's bill rate and has no fee or cap to fall
// back on - a teammate without a rate would have all their hours left off the invoice. So
// for Hourly the bill rate is required. It spans two steps (billing, team), which is why it
// lives here rather than in either step's schema.
export function requiresBillRate(model: BillingModel | undefined): boolean {
  return model === 'hourly'
}

export function hasBillRate(raw: string | undefined): boolean {
  const value = readAmount(raw)
  return value !== undefined && !Number.isNaN(value) && value > 0
}
export type AllocationValues = z.infer<typeof allocationSchema>

/** The end date a row actually uses: its own pick, open-ended, or the project's end date. */
export function resolveEffectiveTo(
  row: Pick<AllocationValues, 'effectiveTo'>,
  targetEndDate: Date | undefined
): Date | null {
  if (row.effectiveTo === undefined) return targetEndDate ?? null
  return row.effectiveTo
}
export type TeamStepValues = z.infer<typeof teamStepSchema>
export type NewProjectWizardValues = z.infer<typeof newProjectWizardSchema>

export const EMPTY_MILESTONE: MilestoneValues = {
  name: '',
  dueDate: undefined,
  estimatedHours: '',
  clientVisible: true,
}
