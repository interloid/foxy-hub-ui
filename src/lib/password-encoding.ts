/**
 * Reversible base64 encode/decode helpers.
 *
 * NOTE: this is encoding, not encryption — it does not add security against
 * network interception (TLS already handles that). Do not rely on this for
 * confidentiality; anyone who can see the encoded value can decode it.
 */

export function encodePassword(value: string): string {
  const bytes = new TextEncoder().encode(value)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary)
}

export function decodePassword(value: string): string {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
