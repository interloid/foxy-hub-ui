export function getAvatarColor(identifier: string) {
  let hash = 0
  const str = identifier || 'user'
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  const hue = Math.abs(hash) % 360

  return {
    backgroundColor: `hsla(${hue}, 70%, 50%, 0.18)`,
    color: `hsl(${hue}, 85%, 65%)`,
  }
}
