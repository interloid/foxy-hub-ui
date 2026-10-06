/**
 * Local-time helpers for the digest. Deno ships `Intl`, so no date library is needed.
 * Mirrors src/lib/date.ts in the app (Edge Functions cannot import from it).
 */

export type LocalNow = {
  /** 0 = Sunday … 6 = Saturday, in the recipient's zone. */
  weekday: number
  /** 0–23, in the recipient's zone. */
  hour: number
  /** 'YYYY-MM-DD', in the recipient's zone. */
  date: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export function localNow(timeZone: string, at: Date = new Date()): LocalNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(at)
  const weekday = WEEKDAYS.indexOf(
    parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  )
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
  return { weekday, hour, date }
}

/** Calendar arithmetic on an ISO date — no clock, so no zone and no DST surprises. */
export function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Monday of the week containing `local`. */
export function mondayOf(local: LocalNow): string {
  return shiftDate(local.date, local.weekday === 0 ? -6 : 1 - local.weekday)
}

export type DigestWeek = {
  /** Monday the email goes out in — the dedupe key. */
  weekStart: string
  /** The week the email reports on: Monday … Sunday before `weekStart`. */
  lastWeekStart: string
  lastWeekEnd: string
  /** This week, for "due this week": `weekStart` … Sunday. */
  thisWeekEnd: string
}

export function digestWeek(local: LocalNow): DigestWeek {
  const weekStart = mondayOf(local)
  return {
    weekStart,
    lastWeekStart: shiftDate(weekStart, -7),
    lastWeekEnd: shiftDate(weekStart, -1),
    thisWeekEnd: shiftDate(weekStart, 6),
  }
}

/** "15 – 21 Sep" for the email's subtitle. */
export function formatRange(from: string, to: string): string {
  const fmt = (iso: string, withMonth: boolean) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`))
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  return `${fmt(from, !sameMonth)} – ${fmt(to, true)}`
}

/** "Wed 24 Sep" for a due date. */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}
