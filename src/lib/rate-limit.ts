import 'server-only'

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { serverEnv } from '@/config/env.server'

const redis = new Redis({
  url: serverEnv.UPSTASH_REDIS_REST_URL,
  token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
})

type RateLimitOptions = {
  limit: number
  windowMs: number
}

type UpstashWindow = Parameters<typeof Ratelimit.slidingWindow>[1]

function formatWindow(windowMs: number): UpstashWindow {
  const seconds = Math.ceil(windowMs / 1000)
  if (seconds < 60) return `${seconds} s` as UpstashWindow
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes} m` as UpstashWindow
  const hours = Math.ceil(minutes / 60)
  return `${hours} h` as UpstashWindow
}

export async function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): Promise<boolean> {
  const windowString = formatWindow(windowMs)

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, windowString),
    analytics: true,
    prefix: 'foxy-hub:ratelimit',
  })

  const { success } = await limiter.limit(key)
  return success
}
