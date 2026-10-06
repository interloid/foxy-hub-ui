export const TIME_ZONE_COOKIE = 'fx_tz'
export const FALLBACK_TIME_ZONE = 'UTC'

/** A real IANA zone this runtime knows — guards cookies, headers and user input. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    return false
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** The zone this browser is in right now. Client-only. */
export function deviceTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return isValidTimeZone(zone) ? zone : FALLBACK_TIME_ZONE
}
