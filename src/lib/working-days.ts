function mondayFirstIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

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

export const WEEKS_PER_MONTH = 52 / 12
