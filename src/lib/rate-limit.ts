type RateLimitOptions = {
  limit: number
  windowMs: number
}

const tracker = new Map<string, { count: number; resetTime: number }>()

export async function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): Promise<boolean> {
  const now = Date.now()
  const record = tracker.get(key)

  if (!record || now > record.resetTime) {
    tracker.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (record.count < limit) {
    record.count++
    return true
  }

  return false
}
