import { z } from 'zod'

// Only variables that are safe to evaluate in the browser belong here.
// Next.js inlines NEXT_PUBLIC_* and NODE_ENV into client bundles; every other
// variable is `undefined` on the client, so validating it here would throw at
// module evaluation in the browser. Server-only vars live in `env.server.ts`.
const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1),
  NEXT_PUBLIC_SITE_DESCRIPTION: z.string().min(1),
  NEXT_PUBLIC_TWITTER_HANDLE: z
    .string()
    .regex(/^@[\w]+$/, 'Twitter handle must start with @'),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_APP_DOMAIN: z.string().min(1),

  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

  NEXT_PUBLIC_SENTRY_DSN: z.string().optional().or(z.literal('')),
  NODE_ENV: z.enum(['development', 'production', 'test']),
})

export const env = envSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_SITE_DESCRIPTION: process.env.NEXT_PUBLIC_SITE_DESCRIPTION,
  NEXT_PUBLIC_TWITTER_HANDLE: process.env.NEXT_PUBLIC_TWITTER_HANDLE,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,

  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_APP_DOMAIN: process.env.NEXT_PUBLIC_APP_DOMAIN,

  NODE_ENV: process.env.NODE_ENV,
})
