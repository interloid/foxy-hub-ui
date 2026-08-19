import { z } from 'zod'

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

const slug = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .refine(
    (value) => SLUG_PATTERN.test(value),
    'Use 3–40 letters, numbers or hyphens.'
  )

const workEmail = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .pipe(z.email('Enter a valid email address.'))
  .transform((value) => value.toLowerCase())

/** Step 1 — the account and workspace details. */
export const accountStepSchema = z.object({
  fullName: z.string().trim().min(1, 'Your name is required.'),
  email: workEmail,
  agencyName: z.string().trim().min(1, 'An agency name is required.'),
  slug,
})

/** Step 2 — plan and billing period. Selections, not typed input, so they cannot be malformed. */
export const planStepSchema = z.object({
  planId: z.string().min(1),
  cycle: z.enum(['monthly', 'yearly']),
})

export const teamInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), z.email('Enter a valid email address.')]))
    .transform((value) => value.toLowerCase()),
  role: z.enum(['Admin', 'Member']),
})

export const MAX_SIGNUP_INVITES = 10

export const teamStepSchema = z.object({
  invites: z
    .array(teamInviteSchema)
    .max(
      MAX_SIGNUP_INVITES,
      `You can invite up to ${MAX_SIGNUP_INVITES} people during signup.`
    ),
})

export const wizardSchema = accountStepSchema
  .extend(planStepSchema.shape)
  .extend(teamStepSchema.shape)

export type WizardInput = z.infer<typeof wizardSchema>

export const createWorkspaceSchema = accountStepSchema.extend({
  planName: z.string().trim().min(1).optional(),
  cycle: z.enum(['monthly', 'yearly']).optional(),
  invites: z
    .array(teamInviteSchema)
    .max(
      MAX_SIGNUP_INVITES,
      `You can invite up to ${MAX_SIGNUP_INVITES} people during signup.`
    )
    .optional(),
})

export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>

export const slugSchema = z.object({ slug })

export const emailSchema = z.object({ email: workEmail })

export const STEP_FIELDS = [
  ['fullName', 'email', 'agencyName', 'slug'],
  ['planId', 'cycle'],
  ['invites'],
  [],
] as const satisfies ReadonlyArray<ReadonlyArray<keyof WizardInput>>

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Check the details and try again.'
}
