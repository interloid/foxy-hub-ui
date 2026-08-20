import 'server-only'

import { z } from 'zod'

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  DEMO_ACCOUNT_EMAIL: z
    .email('DEMO_ACCOUNT_EMAIL must be a valid email address')
    .optional()
    .or(z.literal('')),
  DEMO_ACCOUNT_PASSWORD: z.string().optional().or(z.literal('')),
})

export const serverEnv = serverEnvSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DEMO_ACCOUNT_EMAIL: process.env.DEMO_ACCOUNT_EMAIL,
  DEMO_ACCOUNT_PASSWORD: process.env.DEMO_ACCOUNT_PASSWORD,
})

export const isDemoModeEnabled = (): boolean => {
  return Boolean(
    serverEnv.DEMO_ACCOUNT_EMAIL && serverEnv.DEMO_ACCOUNT_PASSWORD
  )
}
