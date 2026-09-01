import { z } from 'zod'

export const projectAllocationSchema = z.object({
  userId: z.string().min(1, 'Teammate is required'),
  hoursPerDay: z
    .number({ error: 'Hours per day must be a number' })
    .positive('Hours per day must be greater than 0'),
  daysPerWk: z
    .number({ error: 'Days per week must be a number' })
    .positive('Days per week must be greater than 0'),
  rate: z
    .number()
    .positive('Rate must be greater than 0')
    .optional()
    .nullable(),
  effectiveFrom: z.string().min(1, 'Effective date required'),
})

export const createProjectSchema = z
  .object({
    name: z.string().min(1, 'Project name is required').max(150),
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

    // Positive check: budget / contract value / fixed price must be > 0 if provided
    budget: z
      .number({ error: 'Amount must be a number' })
      .positive('Amount must be greater than 0')
      .optional()
      .nullable(),

    // Retainer fields with positive checks
    retainerBucketHours: z
      .number({ error: 'Bucket hours must be a number' })
      .positive('Bucket hours must be greater than 0')
      .optional()
      .nullable(),
    retainerBillingPeriod: z.enum(['Monthly', 'Weekly']).optional().nullable(),
    retainerAmount: z
      .number({ error: 'Retainer amount must be a number' })
      .positive('Retainer amount must be greater than 0')
      .optional()
      .nullable(),
    retainerOverageRate: z
      .number({ error: 'Overage rate must be a number' })
      .nonnegative('Overage rate cannot be negative')
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
  })
