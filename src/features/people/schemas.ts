import { z } from 'zod'

const NAME_MIN = 2
const NAME_MAX = 80

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .refine(
      (value) => value === '' || value.length >= NAME_MIN,
      `Use at least ${NAME_MIN} characters.`
    )
    .transform((value) => value || null)
}

export const clientNameSchema = z
  .string()
  .trim()
  .min(1, 'Client name is required.')
  .min(NAME_MIN, `Use at least ${NAME_MIN} characters.`)
  .max(NAME_MAX, `Keep it under ${NAME_MAX} characters.`)

export const contactNameSchema = optionalText(NAME_MAX)

export const contactEmailSchema = z
  .string()
  .trim()
  .min(1, 'Contact email is required.')
  .pipe(z.email('Enter a valid email address.'))
  .transform((value) => value.toLowerCase())

export const newClientSchema = z.object({
  name: clientNameSchema,
  contactName: contactNameSchema,
  contactEmail: contactEmailSchema,
  portal: z.boolean(),
  invite: z.boolean(),
  projectId: z.string().uuid().optional(),
})

export type NewClientInput = z.infer<typeof newClientSchema>

export function fieldError(
  schema: z.ZodType<unknown, string>,
  value: string
): string | null {
  const result = schema.safeParse(value)
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid.')
}

export const jobTitleSchema = optionalText(60)

export const inviteEmailSchema = z
  .string()
  .trim()
  .min(1, 'Work email is required.')
  .pipe(z.email('Enter a valid email address.'))
  .transform((value) => value.toLowerCase())

export const fullNameSchema = optionalText(NAME_MAX)

export const inviteMemberSchema = z.object({
  email: inviteEmailSchema,
  fullName: fullNameSchema,
  role: z.enum(['Admin', 'Manager', 'Contributor']),
  jobTitle: jobTitleSchema,
})
