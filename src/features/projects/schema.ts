import { z } from 'zod'

export const createDeliverySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: 'Title is required' })
    .max(255, { message: 'Title must be 255 characters or less' }),
  description: z.string().optional(),
  milestoneId: z.string().nullable().optional(),
  dueDate: z.string().min(1, { message: 'Due date is required' }),
})

export type CreateDeliveryFormValues = z.infer<typeof createDeliverySchema>

export const createMilestoneSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: 'Title is required' })
    .max(255, { message: 'Title must be 255 characters or less' }),
  dueDate: z.string().min(1, { message: 'Due date is required' }),
})

export type CreateMilestoneFormValues = z.infer<typeof createMilestoneSchema>
