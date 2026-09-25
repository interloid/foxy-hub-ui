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
  SENTRY_DSN: z.url().optional().or(z.literal('')),
  SENTRY_ORG: z.string().optional().or(z.literal('')),
  SENTRY_PROJECT: z.string().optional().or(z.literal('')),
  SENTRY_AUTH_TOKEN: z.string().optional().or(z.literal('')),

  // Environment Indicators
  VERCEL_ENV: z
    .enum(['development', 'preview', 'production'])
    .optional()
    .or(z.literal('')),

  UPSTASH_REDIS_REST_URL: z
    .string()
    .min(1, 'UPSTASH_REDIS_REST_URL is required'),
  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(1, 'UPSTASH_REDIS_REST_TOKEN is required'),

  // Signs the weekly digest's unsubscribe links. Must equal the weekly-digest Edge
  // Function's DIGEST_UNSUBSCRIBE_SECRET. Optional so the app still boots without it —
  // unsubscribe links are then rejected rather than trusted.
  DIGEST_UNSUBSCRIBE_SECRET: z.string().optional().or(z.literal('')),
})

export const serverEnv = serverEnvSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DEMO_ACCOUNT_EMAIL: process.env.DEMO_ACCOUNT_EMAIL,
  DEMO_ACCOUNT_PASSWORD: process.env.DEMO_ACCOUNT_PASSWORD,
  SENTRY_DSN: process.env.SENTRY_DSN,
  SENTRY_ORG: process.env.SENTRY_ORG,
  SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  DIGEST_UNSUBSCRIBE_SECRET: process.env.DIGEST_UNSUBSCRIBE_SECRET,
})

export const isDemoModeEnabled = (): boolean => {
  return Boolean(
    serverEnv.DEMO_ACCOUNT_EMAIL && serverEnv.DEMO_ACCOUNT_PASSWORD
  )
}
