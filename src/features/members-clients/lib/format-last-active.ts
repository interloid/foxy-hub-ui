export function formatLastActive(
  dateString: string | null | undefined
): string {
  if (!dateString) return 'Never signed in'

  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Never signed in'

  const now = new Date()
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const isSameDay = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const time = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)

  if (isSameDay) return `Today, ${time}`
  if (isYesterday) return `Yesterday, ${time}`

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}
