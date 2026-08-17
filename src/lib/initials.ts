export function initialsOf(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split('@')[0] || ''
  const words = source.split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters =
    words.length === 1 ? words[0]!.slice(0, 1) : words[0]![0]! + words[1]![0]!
  return letters.toUpperCase()
}
