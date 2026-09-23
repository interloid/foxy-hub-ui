import { z } from 'zod'

/**
 * One definition for the New client form AND `createClientAction`.
 *
 * Shared rather than duplicated because the two had already drifted once: the form
 * required a name and the action only checked it was non-empty, so a 1-character
 * client could be created by any caller that skipped the form. The weaker of two
 * limits is the one that counts, so there is only one limit here.
 *
 * Follows the email pattern in `features/auth/schemas.ts` — trim, require, then
 * `z.email`, then lowercase — so a client contact is normalised the same way a
 * sign-in address is.
 */

const NAME_MIN = 2
const NAME_MAX = 80

/**
 * An optional free-text field that is still checked once something is typed in.
 *
 * Empty passes and becomes null; anything non-empty must clear NAME_MIN. That is the
 * rule an "optional" field actually wants — leaving it blank is a choice, but a single
 * stray keystroke is a mistake, and silently storing `J` as somebody's name is worse
 * than asking.
 *
 * `.max()` is checked before the min refine so an over-long value reports its own
 * problem rather than the minimum.
 *
 * null rather than '' on the way out: the columns are nullable, and an empty string
 * would read as "there is a value and it is blank", which is a different claim.
 */
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

/**
 * OPTIONAL — only the client name and contact email are mandatory.
 *
 * An agency often has the company before it has a named person there, and the email is
 * the field that has to work (it is where the portal invite goes). Blank is therefore
 * fine, but a name that IS typed gets the same minimum as any other name.
 */
export const contactNameSchema = optionalText(NAME_MAX)

export const contactEmailSchema = z
  .string()
  .trim()
  .min(1, 'Contact email is required.')
  .pipe(z.email('Enter a valid email address.'))
  .transform((value) => value.toLowerCase())

export const newClientSchema = z.object({
  name: clientNameSchema,
  /** Optional — see contactNameSchema. Absent arrives as '' from the form. */
  contactName: contactNameSchema,
  contactEmail: contactEmailSchema,
  portal: z.boolean(),
  invite: z.boolean(),
  projectId: z.string().uuid().optional(),
})

export type NewClientInput = z.infer<typeof newClientSchema>

/** First message for one field, or null when it passes. */
export function fieldError(
  schema: z.ZodType<unknown, string>,
  value: string
): string | null {
  const result = schema.safeParse(value)
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid.')
}

/**
 * Job title — OPTIONAL free text, typed in rather than chosen from a list.
 *
 * Blank is allowed: the person sending the invite may not know the title yet, and the
 * column is nullable because the workspace creator has no invitation to read one from
 * either. A title that IS entered must clear the 2-character minimum and the 60 the
 * column checks, so the form refuses exactly what the database refuses.
 *
 * Text and not a Postgres enum: `user_role` showed what that costs. Renaming two of its
 * values needed an ALTER TYPE, a rewrite of every plpgsql body that spelled them out,
 * and a lockstep deploy — and `db diff` reported "No schema changes found" for the lot.
 */
export const jobTitleSchema = optionalText(60)

/** Work email for an invite — same shape as the client contact email. */
export const inviteEmailSchema = z
  .string()
  .trim()
  .min(1, 'Work email is required.')
  .pipe(z.email('Enter a valid email address.'))
  .transform((value) => value.toLowerCase())

/** Optional, but held to the minimum once something is typed. */
export const fullNameSchema = optionalText(NAME_MAX)

export const inviteMemberSchema = z.object({
  email: inviteEmailSchema,
  fullName: fullNameSchema,
  role: z.enum(['Admin', 'Manager', 'Contributor']),
  jobTitle: jobTitleSchema,
})
