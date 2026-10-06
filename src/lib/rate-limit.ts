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

/**
 * True when the request is within the limit.
 *
 * FAILS OPEN (RISK-010): if Upstash Redis cannot be reached — outage, slow network, bad
 * token, quota — the request is allowed and the failure is logged. This limiter is an extra
 * layer; it used to throw, which crashed every caller, including sign-in, so a Redis
 * problem locked everyone out of the app. Supabase Auth still applies its own sign-in
 * limits while this one is unavailable.
 */
export async function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): Promise<boolean> {
  try {
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, formatWindow(windowMs)),
      analytics: true,
      prefix: 'foxy-hub:ratelimit',
    })

    const { success } = await limiter.limit(key)
    return success
  } catch (err) {
    // The key's prefix only (e.g. "sign-in"), never the rest — it can hold an email or IP.
    console.error(
      `rate limit unavailable (${key.split(':')[0]}), allowing request:`,
      (err as Error).message
    )
    return true
  }
}
