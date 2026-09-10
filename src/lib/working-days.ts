/**
 * Working-day arithmetic, shared by anything that turns a rate into a total.
 *
 * A rate (hours per day, dollars per hour) only becomes a total once multiplied by a
 * duration, and the duration that matters is WORKING days, not calendar days. Both the hours
 * burn card and the New project panel's cost projection need the same count, and a second
 * implementation of it is a second answer.
 */

/** Monday = 0 … Sunday = 6. `Date.getDay()` puts Sunday first, which nothing else here does. */
function mondayFirstIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

/**
 * Working days between two dates, inclusive.
 *
 * A `daysPerWeek` of 5 counts Mon–Fri, 6 counts Mon–Sat, 7 counts every day — and unlike the
 * older `>= 6 ? Mon-Sat : Mon-Fri` form, 1–4 are counted honestly instead of being rounded
 * up to a full week. Someone booked three days a week is not working five.
 *
 * Which weekdays those are is an assumption: the schema records how MANY days a week someone
 * works, never which ones, so the count starts at Monday.
 */
export function workingDaysBetween(
  start: Date,
  end: Date,
  daysPerWeek = 5
): number {
  if (start > end) return 0

  const perWeek = Math.min(7, Math.max(1, Math.round(daysPerWeek)))

  let count = 0
  const cursor = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate()
  )
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())

  while (cursor <= last) {
    if (mondayFirstIndex(cursor) < perWeek) count++
    cursor.setDate(cursor.getDate() + 1)
  }

  return count
}

/** Parses a `date` column's `YYYY-MM-DD` as a LOCAL day, not a UTC instant. */
export function fromISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)

  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

/**
 * Weeks in an average month, for turning a weekly burn into a monthly one when there is no
 * date range to count. 52 / 12 — not 4, which understates every month by roughly a third of
 * a week and makes a projection look affordable when it is not.
 */
export const WEEKS_PER_MONTH = 52 / 12
