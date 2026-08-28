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
