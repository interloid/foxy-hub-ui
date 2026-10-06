import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { serverEnv } from '@/config/env.server'

export function isValidUnsubscribeToken(
  userId: string,
  token: string
): boolean {
  const secret = serverEnv.DIGEST_UNSUBSCRIBE_SECRET
  if (!secret || !userId || !token) return false

  const expected = createHmac('sha256', secret)
    .update(`weekly-digest-unsubscribe:${userId}`)
    .digest('base64url')

  const a = Buffer.from(expected)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}
