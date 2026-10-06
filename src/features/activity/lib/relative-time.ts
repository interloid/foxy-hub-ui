import type { Formatter } from '@/lib/format'

/** "Just now", "12m ago", "4h ago" today; "Yesterday, 16:20"; then the date and time. */
export function relativeTime(value: string, fmt: Formatter) {
  const date = new Date(value)
  const now = new Date()
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`

  const day = fmt.date(date, 'date')
  if (day === fmt.date(now, 'date')) return `${Math.floor(minutes / 60)}h ago`

  const yesterday = new Date(now.getTime() - 86_400_000)
  if (day === fmt.date(yesterday, 'date')) {
    return `Yesterday, ${fmt.date(date, 'time')}`
  }
  return fmt.date(date, 'dateTime')
}
