import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { siteConfig } from '@/config/site'
import { isValidUnsubscribeToken } from '@/lib/digest-token'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Unsubscribe from the weekly digest — no sign-in needed. The link carries the user id and
 * an HMAC of it, so it can only ever turn off that one person's digest.
 *
 *   GET  — the link in the email footer. Changes NOTHING: it shows a confirm button. Mail
 *          security scanners (Microsoft Safe Links, Mimecast…) and link previewers open
 *          every link in an email automatically, so a GET that unsubscribed turned people's
 *          digest off without them clicking anything (RISK-008). Scanners do not submit
 *          forms.
 *   POST — does the unsubscribe: the confirm button, and RFC 8058 one-click
 *          (`List-Unsubscribe-Post`, sent by Gmail/Outlook's own Unsubscribe button).
 *
 * proxy.ts lets this path through untouched: it must work signed in, signed out, or as
 * someone else.
 */

type Link = { userId: string; token: string }

/** The link's user id and token, if they are well-formed and the token is genuine. */
function readLink(request: NextRequest): Link | null {
  const url = new URL(request.url)
  const userId = url.searchParams.get('u') ?? ''
  const token = url.searchParams.get('t') ?? ''

  if (!z.uuid().safeParse(userId).success) return null
  if (!isValidUnsubscribeToken(userId, token)) return null
  return { userId, token }
}

async function unsubscribe({ userId }: Link): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin.from('user_preferences').upsert(
    {
      user_id: userId,
      weekly_digest: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (error) {
    console.error('digest unsubscribe failed:', error.message)
    return false
  }
  return true
}

const BUTTON_STYLE =
  'display:inline-block;padding:10px 18px;border-radius:8px;border:0;background:#e8651a;color:#fff;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;font-family:inherit;'

/** `action` is optional extra HTML (the confirm form); callers pass only fixed strings. */
function page(
  title: string,
  body: string,
  status: number,
  action = `<a href="${siteConfig.url}" style="${BUTTON_STYLE}">Open Foxy HUB</a>`
): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>${title}</title></head>
<body style="margin:0;background:#f7f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
<main style="max-width:440px;margin:64px auto;padding:32px 28px;background:#fff;border:1px solid #e7e2da;border-radius:12px;">
<h1 style="margin:0 0 8px;font-size:20px;">${title}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:22px;color:#57534e;">${body}</p>
${action}
</main></body></html>`
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

const invalidLink = () =>
  page(
    'This link did not work',
    'It may be incomplete or out of date. Turn the weekly digest off from Settings → General instead.',
    400
  )

export async function GET(request: NextRequest) {
  const link = readLink(request)
  if (!link) return invalidLink()

  // Posts back to this same URL. Both values are safe to embed: the id is a validated UUID
  // and the token matched its HMAC, so it is plain base64url.
  const action = `/api/digest/unsubscribe?u=${encodeURIComponent(link.userId)}&t=${encodeURIComponent(link.token)}`
  return page(
    'Unsubscribe from the weekly digest?',
    'You will stop getting the Monday summary of your projects, hours and approvals. You can turn it back on any time in Settings → General.',
    200,
    `<form method="post" action="${action}" style="margin:0;"><button type="submit" style="${BUTTON_STYLE}">Unsubscribe</button></form>`
  )
}

export async function POST(request: NextRequest) {
  const link = readLink(request)
  if (!link) return invalidLink()

  if (!(await unsubscribe(link))) {
    return page(
      'Something went wrong',
      'We could not unsubscribe you just now. Try again, or turn the weekly digest off from Settings → General.',
      500
    )
  }

  // A browser (the confirm button) shows this page; a mail client's one-click POST only
  // needs the 200.
  return page(
    'You are unsubscribed',
    'You will no longer get the Monday weekly digest. You can turn it back on any time in Settings → General.',
    200
  )
}
