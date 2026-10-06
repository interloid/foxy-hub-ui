import { z } from 'zod'

export const fullNameSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Enter name.')
    .max(80, 'Use 80 characters or fewer.'),
})

export type FullNameInput = z.infer<typeof fullNameSchema>

export const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter email.')
    .max(254, 'Use 254 characters or fewer.')
    .email('Enter a valid email address.'),
})

export type EmailInput = z.infer<typeof emailSchema>
