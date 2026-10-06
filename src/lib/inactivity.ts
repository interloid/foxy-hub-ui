export const INACTIVITY_METADATA_KEY = 'inactivity_timeout'

export const INACTIVITY_TIMEOUTS = ['8h', '24h', '7d', 'never'] as const
export type InactivityTimeout = (typeof INACTIVITY_TIMEOUTS)[number]

/** What an account with no stored choice gets — no backfill needed. */
export const DEFAULT_INACTIVITY_TIMEOUT: InactivityTimeout = '24h'

const HOUR = 60 * 60 * 1000

export const INACTIVITY_LIMIT_MS: Record<
  Exclude<InactivityTimeout, 'never'>,
  number
> = {
  '8h': 8 * HOUR,
  '24h': 24 * HOUR,
  '7d': 7 * 24 * HOUR,
}

export const INACTIVITY_LABELS: Record<InactivityTimeout, string> = {
  '8h': 'After 8 hours',
  '24h': 'After 24 hours',
  '7d': 'After 7 days',
  never: 'Never',
}

export function isInactivityTimeout(
  value: unknown
): value is InactivityTimeout {
  return (
    typeof value === 'string' &&
    (INACTIVITY_TIMEOUTS as readonly string[]).includes(value)
  )
}

/** The user's choice from their metadata, or the default when missing or unknown. */
export function inactivityTimeoutOf(
  metadata: Record<string, unknown> | null | undefined
): InactivityTimeout {
  const value = metadata?.[INACTIVITY_METADATA_KEY]
  return isInactivityTimeout(value) ? value : DEFAULT_INACTIVITY_TIMEOUT
}

/** Limit in ms, or null for "never". */
export function inactivityLimitMs(timeout: InactivityTimeout): number | null {
  return timeout === 'never' ? null : INACTIVITY_LIMIT_MS[timeout]
}

export const LAST_ACTIVE_COOKIE = 'fx_last_active'

/** How stale the cookie may get before proxy.ts rewrites it — not on every request. */
export const LAST_ACTIVE_TOUCH_MS = 60 * 1000

/** Browser-side last activity, shared across tabs so one busy tab keeps the rest alive. */
export const LAST_ACTIVITY_STORAGE_KEY = 'fx_last_activity'

export function parseLastActive(
  value: string | undefined
): { sessionId: string; at: number } | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const at = Number(value.slice(dot + 1))
  if (!Number.isFinite(at)) return null
  return { sessionId: value.slice(0, dot), at }
}

export function formatLastActive(sessionId: string, at: number): string {
  return `${sessionId}.${at}`
}
