import z from 'zod'

const projectAllocationSchema = z.object({
  userId: z.uuid('Invalid user ID'),
  hoursPerDay: z.number().min(0.5).max(24),
  daysPerWk: z.number().min(1).max(7),
  rate: z.number().optional(),
  effectiveFrom: z.string().min(1, 'Effective date required'),
})

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(150),
  startFrom: z.string().optional(),
  clientId: z.uuid().optional().nullable(),
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
  budget: z.number().optional().nullable(),

  // Retainer fields
  retainerBucketHours: z.number().optional().nullable(),
  retainerBillingPeriod: z.enum(['Monthly', 'Weekly']).optional().nullable(),
  retainerAmount: z.number().optional().nullable(),
  retainerOverageRate: z.number().optional().nullable(),

  brief: z.string().max(1000).optional(),
  overrideReason: z.string().max(500).optional(),
  allocations: z.array(projectAllocationSchema).default([]),
})
