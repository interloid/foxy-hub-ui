import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1),
  NEXT_PUBLIC_SITE_DESCRIPTION: z.string().min(1),
  NEXT_PUBLIC_TWITTER_HANDLE: z
    .string()
    .regex(/^@[\w]+$/, 'Twitter handle must start with @'),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DEMO_ACCOUNT_EMAIL: z.email(
    'DEMO_ACCOUNT_EMAIL must be a valid email address'
  ),

  DEMO_ACCOUNT_PASSWORD: z.string().min(1, 'DEMO_ACCOUNT_PASSWORD is required'),
})

export const env = envSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_SITE_DESCRIPTION: process.env.NEXT_PUBLIC_SITE_DESCRIPTION,
  NEXT_PUBLIC_TWITTER_HANDLE: process.env.NEXT_PUBLIC_TWITTER_HANDLE,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,

  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NODE_ENV: process.env.NODE_ENV,
  DEMO_ACCOUNT_EMAIL: process.env.DEMO_ACCOUNT_EMAIL,
  DEMO_ACCOUNT_PASSWORD: process.env.DEMO_ACCOUNT_PASSWORD,
})
