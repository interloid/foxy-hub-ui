import { shiftISODate } from '@/lib/date'

export type RetainerCadence = 'weekly' | 'monthly'

export interface RetainerPeriod {
  start: string
  end: string
}

export interface BillingPeriodOption extends RetainerPeriod {
  invoiced: boolean
}

function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`
}

function monthEnd(isoMonthStart: string): string {
  const [year, month] = isoMonthStart.split('-').map(Number)
  return new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10)
}

function nextMonthStart(isoMonthStart: string): string {
  const [year, month] = isoMonthStart.split('-').map(Number)
  return new Date(Date.UTC(year!, month!, 1)).toISOString().slice(0, 10)
}

/** Monday on or before `isoDate` — retainer weeks run Monday to Sunday. */
function weekStart(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()
  return shiftISODate(isoDate, weekday === 0 ? -6 : 1 - weekday)
}

/**
 * Every retainer period that can be billed today, oldest first: from the period the project
 * started in, up to the last one that has fully ended. The period still running (this month,
 * this week) is never billable, nor is anything before the project began or after its due
 * date. `windowStart`/`windowEnd` are the project's billable window as `YYYY-MM-DD`.
 */
export function listRetainerPeriods(
  cadence: RetainerCadence,
  windowStart: string,
  windowEnd: string | null,
  today: string
): RetainerPeriod[] {
  const periods: RetainerPeriod[] = []

  let start =
    cadence === 'weekly' ? weekStart(windowStart) : monthStart(windowStart)

  while (true) {
    const end = cadence === 'weekly' ? shiftISODate(start, 6) : monthEnd(start)

    if (end >= today) break
    if (windowEnd && start > windowEnd) break

    periods.push({ start, end })
    start =
      cadence === 'weekly' ? shiftISODate(start, 7) : nextMonthStart(start)
  }

  return periods
}

function utcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`)
}

/** "August 2026" */
export function formatMonthLabel(isoDate: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDate(isoDate))
}

/** "Aug 3 – Aug 9" */
export function formatWeekLabel(
  period: RetainerPeriod,
  locale = 'en-US'
): string {
  const format = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return `${format.format(utcDate(period.start))} – ${format.format(utcDate(period.end))}`
}

/** "August 2026" for a month, "Aug 3 – Aug 9, 2026" for a week. */
export function formatPeriodLabel(
  cadence: RetainerCadence,
  period: RetainerPeriod,
  locale = 'en-US'
): string {
  if (cadence === 'monthly') return formatMonthLabel(period.start, locale)
  return `${formatWeekLabel(period, locale)}, ${period.end.slice(0, 4)}`
}
