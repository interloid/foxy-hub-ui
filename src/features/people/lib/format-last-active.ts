import { dateIn, shiftISODate, todayIn } from '@/lib/date'
import type { Formatter } from '@/lib/format'

/**
 * "Just now" · "12 min ago" · "Today, 19:04" · "Yesterday, 7:04 PM" · "Sep 23" — in the
 * viewer's locale and time zone (`getFormatter()`), so "today" is THEIR today, not the
 * server's UTC one.
 */
export function formatLastActive(
  dateString: string | null | undefined,
  fmt: Formatter,
  timeZone: string
): string {
  if (!dateString) return 'Never signed in'

  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Never signed in'

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const day = dateIn(timeZone, date)
  const today = todayIn(timeZone)
  const time = fmt.date(date, 'time')

  if (day === today) return `Today, ${time}`
  if (day === shiftISODate(today, -1)) return `Yesterday, ${time}`
  return fmt.date(date, 'day')
}
