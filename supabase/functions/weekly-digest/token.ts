/**
 * Unsubscribe links. An HMAC of the user id with DIGEST_UNSUBSCRIBE_SECRET, so a link
 * turns off exactly one person's digest and cannot be forged for anyone else. The app's
 * /api/digest/unsubscribe route checks it with the same secret (src/lib/digest-token.ts).
 */

function base64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function unsubscribeToken(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`weekly-digest-unsubscribe:${userId}`)
  )
  return base64Url(signature)
}

export async function unsubscribeUrl(
  appUrl: string,
  userId: string,
  secret: string
): Promise<string> {
  const token = await unsubscribeToken(userId, secret)
  return `${appUrl}/api/digest/unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`
}
