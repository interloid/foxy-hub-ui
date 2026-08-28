import { toISODate } from './date'

export function getStartOfWeekISO(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff)
  )
  return toISODate(monday)
}
