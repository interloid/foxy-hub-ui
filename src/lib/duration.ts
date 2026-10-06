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

  // A bare number is hours ("1.5" = 90m). It must be the WHOLE input: parseFloat alone
  // reads a leading number and ignores the rest, so "4abc" used to be taken as 4 hours.
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = parseFloat(trimmed)
    if (num > 0) return Math.round(num * 60)
  }

  return null
}

/** 150 -> "2h 30m", 60 -> "1h", 45 -> "45m": a duration as the feed prints it. */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = Math.round(total % 60)
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}
