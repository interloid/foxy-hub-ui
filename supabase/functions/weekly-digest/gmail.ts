/**
 * Sends through the Gmail API with the same Google OAuth credentials as
 * invoice-overdue-handler (G_CLIENT_ID, G_CLIENT_SECRET, G_REFRESH_TOKEN). Mail goes out
 * from the Google account those credentials belong to.
 *
 * Gmail sending limits apply (about 500 a day on a personal account, 2,000 on Google
 * Workspace) and are SHARED with the overdue-invoice emails.
 */
import type { DigestEmail } from './template.ts'

export async function getGmailAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('G_CLIENT_ID')!,
      client_secret: Deno.env.get('G_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('G_REFRESH_TOKEN')!,
      grant_type: 'refresh_token',
    }),
  })
  const tokenData = await response.json()
  if (!tokenData.access_token) {
    throw new Error('Google token exchange failed: ' + JSON.stringify(tokenData))
  }
  return tokenData.access_token as string
}

function base64(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64Url(text: string): string {
  return base64(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** RFC 2047 — the subject has "·" and "–", which a raw header cannot carry. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${base64(value)}?=`
}

/** Base64 body lines wrapped at 76 characters, as MIME requires. */
function wrap(encoded: string): string {
  return encoded.match(/.{1,76}/g)?.join('\r\n') ?? ''
}

export async function sendGmail(params: {
  accessToken: string
  /** Optional display name + address, e.g. `Foxy HUB <you@interloid.com>`. Must be the
   * Google account itself or one of its verified "Send mail as" aliases. */
  from?: string
  to: string
  email: DigestEmail
  unsubscribeUrl: string
}): Promise<{ id: string } | { error: string }> {
  const boundary = `digest-${crypto.randomUUID()}`
  const raw = [
    ...(params.from ? [`From: ${params.from}`] : []),
    `To: ${params.to}`,
    `Subject: ${encodeHeader(params.email.subject)}`,
    'MIME-Version: 1.0',
    `List-Unsubscribe: <${params.unsubscribeUrl}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(base64(params.email.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(base64(params.email.html)),
    `--${boundary}--`,
    '',
  ].join('\r\n')

  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64Url(raw) }),
    }
  )

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    return { error: `${response.status} ${body?.error?.message ?? ''}`.trim() }
  }
  return { id: body.id as string }
}
