export function getStartOfWeekISO(date: Date = new Date()): string {
  const day = date.getUTCDay()
  // Adjust to Monday: Monday = 1 ... Sunday = 7
  const diff = date.getUTCDate() - (day === 0 ? 6 : day - 1)
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff)
  )

  const year = monday.getUTCFullYear()
  const month = String(monday.getUTCMonth() + 1).padStart(2, '0')
  const dayOfMonth = String(monday.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${dayOfMonth}`
}
