export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${month}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function addDaysISO(days: number): string {
  const date = new Date()

  date.setDate(date.getDate() + days)

  return toISODate(date)
}

export function startOfMonthISO(): string {
  const date = new Date()

  date.setDate(1)

  return toISODate(date)
}

/** 'YYYY-MM-DD' of `date` as seen in `timeZone` (en-CA formats dates as ISO). */
export function dateIn(timeZone: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Calendar days from `date` to `now` in `timeZone`: 0 = today, 1 = yesterday. Counted on
 * ISO dates, so it matches what a formatter in that zone prints — not the device's own
 * zone — and a DST change never makes a day 23 or 25 hours long.
 */
export function daysAgoIn(
  timeZone: string,
  date: Date | string,
  now: Date = new Date()
): number {
  const day = (value: Date) =>
    Date.parse(`${dateIn(timeZone, value)}T00:00:00Z`)
  return Math.round((day(now) - day(new Date(date))) / 86_400_000)
}

export function todayIn(timeZone: string): string {
  return dateIn(timeZone)
}

/** Calendar arithmetic on an ISO date — no clock, so no zone and no DST surprises. */
export function shiftISODate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days))
  return shifted.toISOString().slice(0, 10)
}

export function startOfWeekIn(
  timeZone: string,
  date: Date = new Date()
): string {
  const today = dateIn(timeZone, date)
  const [year, month, day] = today.split('-').map(Number)
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()
  return shiftISODate(today, weekday === 0 ? -6 : 1 - weekday)
}

/** The 1st of the current month in `timeZone`. */
export function startOfMonthIn(
  timeZone: string,
  date: Date = new Date()
): string {
  return `${dateIn(timeZone, date).slice(0, 8)}01`
}

/** Minutes `timeZone` is ahead of UTC at instant `ms` (330 for India). */
export function timeZoneOffsetMinutes(
  timeZone: string,
  ms: number = Date.now()
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms))
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  )
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000)
}

export function startOfDayInstantIn(timeZone: string, isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const guess = Date.UTC(year!, month! - 1, day!)
  // Once more at the corrected instant, so a DST change that day lands right.
  const first = guess - timeZoneOffsetMinutes(timeZone, guess) * 60000
  const instant = guess - timeZoneOffsetMinutes(timeZone, first) * 60000
  return new Date(instant).toISOString()
}

/** "GMT+05:30" / "GMT-04:00" / "GMT+00:00" for display. */
export function gmtOffsetLabel(
  timeZone: string,
  ms: number = Date.now()
): string {
  const offset = timeZoneOffsetMinutes(timeZone, ms)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const minutes = String(abs % 60).padStart(2, '0')
  return `GMT${sign}${hours}:${minutes}`
}
