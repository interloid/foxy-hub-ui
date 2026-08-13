import { z } from 'zod'

const email = z
  .string()
  .trim()
  .min(1, 'Enter your work email.')
  .pipe(z.email('Enter a valid email address.'))
  .transform((value) => value.toLowerCase())

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
})

export type SignInInput = z.infer<typeof signInSchema>

export const resetRequestSchema = z.object({ email })

export type ResetRequestInput = z.infer<typeof resetRequestSchema>

export const setPasswordSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters.'),
    confirm: z.string().min(1, 'Confirm your password.'),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Those passwords do not match.',
    path: ['confirm'],
  })

export type SetPasswordInput = z.infer<typeof setPasswordSchema>

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password.'),
    password: z.string().min(8, 'Use at least 8 characters.'),
    confirm: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Those passwords do not match.',
    path: ['confirm'],
  })
  .refine((values) => values.password !== values.current, {
    message: 'Your new password must be different from your current one.',
    path: ['password'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Check the details and try again.'
}
