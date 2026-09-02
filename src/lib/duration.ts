export function parseDurationToMinutes(val: string): number | null {
  const trimmed = val.trim().toLowerCase()
  if (!trimmed || trimmed.includes('-')) return null

  // Matches pattern: 1h 30m, 1h, 30m, 90m
  const timeRegex = /^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+)m)?$/
  const timeMatch = trimmed.match(timeRegex)

  if (timeMatch && (timeMatch[1] !== undefined || timeMatch[2] !== undefined)) {
    const hours = timeMatch[1] ? parseFloat(timeMatch[1]) : 0
    const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
    const total = Math.round(hours * 60 + mins)
    return isNaN(total) || total <= 0 ? null : total
  }

  const num = parseFloat(trimmed)
  if (!isNaN(num) && num > 0) {
    return Math.round(num * 60)
  }

  return null
}
