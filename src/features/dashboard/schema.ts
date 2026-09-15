import { z } from 'zod'

function asStored(value: number, scale = 2): number {
  const factor = 10 ** scale

  return Math.round(value * factor) / factor
}

const MONEY_MAX = 9_999_999_999.99
const BUCKET_HOURS_MAX = 9_999.99
const MULTIPLIER_MAX = 99.99
const ESTIMATED_HOURS_MAX = 999_999.99
const HOURS_PER_DAY_MAX = 24

const HOURS_PER_DAY_MIN = 0.25

function positiveMoney(label: string) {
  return z
    .number({ error: `${label} must be a number` })
    .refine((v) => asStored(v) > 0, {
      message: `${label} must be at least 0.01`,
    })
    .refine((v) => v <= MONEY_MAX, {
      message: `${label} is too large`,
    })
}

export const projectAllocationSchema = z.object({
  userId: z.string().min(1, 'Teammate is required'),

  hoursPerDay: z
    .number({ error: 'Hours per day must be a number' })
    .refine((v) => asStored(v) >= HOURS_PER_DAY_MIN, {
      message: 'Hours per day must be at least 0.25',
    })
    .refine((v) => asStored(v) <= HOURS_PER_DAY_MAX, {
      message: 'Hours per day cannot exceed 24',
    }),

  daysPerWk: z
    .number({ error: 'Days per week must be a number' })
    .int('Days per week must be a whole number')
    .min(1, 'Days per week must be at least 1')
    .max(7, 'Days per week cannot exceed 7'),
  rate: positiveMoney('Rate').optional().nullable(),

  effectiveFrom: z.string().min(1, 'Effective date required'),
})

export const createProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Project name must be at least 2 characters')
      .max(100, 'Project name must be 100 characters or less'),
    startFrom: z.string().optional(),
    clientId: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    engagement: z.enum([
      'full_time',
      'part_time',
      'retainer',
      'fixed',
      'full-time',
      'part-time',
      'fixed-price',
    ]),

    budget: positiveMoney('Amount').optional().nullable(),

    retainerBucketHours: z
      .number({ error: 'Bucket hours must be a number' })
      .refine((v) => asStored(v) > 0, {
        message: 'Bucket hours must be at least 0.01',
      })
      .refine((v) => v <= BUCKET_HOURS_MAX, {
        message: 'Bucket hours is too large',
      })
      .optional()
      .nullable(),

    estimatedHours: z
      .number({ error: 'Estimated hours must be a number' })
      .refine((v) => asStored(v) > 0, {
        message: 'Estimated hours must be at least 0.01',
      })
      .refine((v) => v <= ESTIMATED_HOURS_MAX, {
        message: 'Estimated hours is too large',
      })
      .optional()
      .nullable(),

    retainerBillingPeriod: z.enum(['Monthly', 'Weekly']).optional().nullable(),

    retainerAmount: positiveMoney('Retainer amount').optional().nullable(),

    retainerOverageRate: z
      .number({ error: 'Overage rate must be a number' })
      .nonnegative('Overage rate cannot be negative')
      .max(MULTIPLIER_MAX, 'Overage rate is too large')
      .optional()
      .nullable(),

    brief: z.string().max(1000).optional(),
    overrideReason: z.string().max(500).optional(),
    allocations: z.array(projectAllocationSchema).default([]),
  })
  .superRefine((data, ctx) => {
    // Conditional dynamic checks on submission
    const isFullOrPart =
      data.engagement === 'full_time' ||
      data.engagement === 'full-time' ||
      data.engagement === 'part_time' ||
      data.engagement === 'part-time'

    const isFixed =
      data.engagement === 'fixed' || data.engagement === 'fixed-price'

    const isRetainer = data.engagement === 'retainer'

    if (isFullOrPart && (data.budget === undefined || data.budget === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['budget'],
        message: 'Budget / contract value is required',
      })
    }

    if (isFixed && (data.budget === undefined || data.budget === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['budget'],
        message: 'Fixed price is required',
      })
    }

    if (isRetainer) {
      if (!data.retainerBucketHours) {
        ctx.addIssue({
          code: 'custom',
          path: ['retainerBucketHours'],
          message: 'Retainer bucket hours are required',
        })
      }
      if (!data.retainerAmount) {
        ctx.addIssue({
          code: 'custom',
          path: ['retainerAmount'],
          message: 'Retainer amount is required',
        })
      }
    }

    if (isFullOrPart) {
      data.allocations.forEach((allocation, index) => {
        if (allocation.rate === undefined || allocation.rate === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['allocations', index, 'rate'],
            message: 'Rate is required for hourly engagements',
          })
        }
      })
    }

    const seen = new Set<string>()

    data.allocations.forEach((allocation, index) => {
      const key = `${allocation.userId}:${allocation.effectiveFrom}`

      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['allocations', index, 'effectiveFrom'],
          message:
            'This teammate already has an allocation starting on that date. Change the date or edit the existing row.',
        })
      }

      seen.add(key)
    })
  })

function readAmount(raw?: string): number | undefined | typeof NaN {
  if (raw === undefined) return undefined

  const trimmed = raw.trim()
  if (trimmed === '') return undefined

  const parsed = Number(trimmed)

  return Number.isFinite(parsed) ? parsed : NaN
}

interface AmountRule {
  label: string
  required: boolean
  max: number
  allowZero?: boolean
}

function checkAmount(
  ctx: z.RefinementCtx,
  path: string,
  raw: string | undefined,
  { label, required, max, allowZero = false }: AmountRule
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
    return
  }

  if (value < 0) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: `${label} cannot be negative`,
    })
    return
  }

  if (!allowZero && asStored(value) <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: `${label} must be at least 0.01`,
    })
    return
  }

  if (value > max) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: `${label} is too large`,
    })
  }
}

const formAllocationSchema = z.object({
  userId: z.string().min(1, 'Teammate is required'),

  memberName: z.string(),
  preset: z.string(),

  hoursPerDay: z
    .number({ error: 'Hours per day must be a number' })
    .refine((v) => asStored(v) >= HOURS_PER_DAY_MIN, {
      message: 'Hours per day must be at least 0.25',
    })
    .refine((v) => asStored(v) <= HOURS_PER_DAY_MAX, {
      message: 'Hours per day cannot exceed 24',
    }),

  daysPerWk: z
    .number({ error: 'Days per week must be a number' })
    .int('Days per week must be a whole number')
    .min(1, 'Days per week must be at least 1')
    .max(7, 'Days per week cannot exceed 7'),

  rate: positiveMoney('Rate').optional(),

  effectiveFrom: z.string().min(1, 'Effective date required'),
})

export const newProjectFormSchema = z
  .object({
    projectName: z.string().min(1, 'Project name is required').max(150),
    selectedStartFrom: z.string(),
    selectedClient: z.string().optional(),
    targetDate: z.date().optional(),
    selectedEngagement: z.string(),
    budget: z.string().optional(),
    fixedPrice: z.string().optional(),
    estimatedHours: z.string().optional(),
    retainerBucketHours: z.string().optional(),
    retainerBillingPeriod: z.string().optional(),
    retainerAmount: z.string().optional(),
    retainerOverageRate: z.string().optional(),
    brief: z.string().max(1000, 'Brief is too long').optional(),
    overrideReason: z.string().max(500, 'Reason is too long').optional(),
    allocations: z.array(formAllocationSchema),
  })
  .superRefine((data, ctx) => {
    const isFullOrPart =
      data.selectedEngagement === 'full_time' ||
      data.selectedEngagement === 'full-time' ||
      data.selectedEngagement === 'part_time' ||
      data.selectedEngagement === 'part-time'

    const isFixed =
      data.selectedEngagement === 'fixed' ||
      data.selectedEngagement === 'fixed-price'

    const isRetainer = data.selectedEngagement === 'retainer'

    if (isFullOrPart) {
      checkAmount(ctx, 'budget', data.budget, {
        label: 'Contract value / budget',
        required: true,
        max: MONEY_MAX,
      })
    }

    if (isFixed) {
      checkAmount(ctx, 'fixedPrice', data.fixedPrice, {
        label: 'Fixed price',
        required: true,
        max: MONEY_MAX,
      })
      checkAmount(ctx, 'estimatedHours', data.estimatedHours, {
        label: 'Estimated hours',
        required: false,
        max: ESTIMATED_HOURS_MAX,
      })
    }

    if (isRetainer) {
      checkAmount(ctx, 'retainerBucketHours', data.retainerBucketHours, {
        label: 'Bucket hours',
        required: true,
        max: BUCKET_HOURS_MAX,
      })
      checkAmount(ctx, 'retainerAmount', data.retainerAmount, {
        label: 'Retainer amount',
        required: true,
        max: MONEY_MAX,
      })
      checkAmount(ctx, 'retainerOverageRate', data.retainerOverageRate, {
        label: 'Overage rate',
        required: false,
        max: MULTIPLIER_MAX,
        allowZero: true,
      })
    }

    if (isFullOrPart) {
      data.allocations.forEach((allocation, index) => {
        if (allocation.rate === undefined || allocation.rate === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['allocations', index, 'rate'],
            message: 'Rate is required for hourly engagements',
          })
        }
      })
    }

    const seen = new Set<string>()

    data.allocations.forEach((allocation, index) => {
      const key = `${allocation.userId}:${allocation.effectiveFrom}`

      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['allocations', index, 'effectiveFrom'],
          message: 'Already allocated on this date',
        })
      }

      seen.add(key)
    })
  })
