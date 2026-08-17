import { z } from 'zod'

export const fullNameSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(80, 'Use 80 characters or fewer.'),
})

export type FullNameInput = z.infer<typeof fullNameSchema>
