import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DEMO_DISABLED, isDemoCaller } from '../_shared/demo.ts'
import { invoiceReminderTemplate } from './reminder.template.ts'

/**
 * Emails the client a payment reminder for one invoice - the Remind button on the Invoices
 * page. Same delivery as the nightly overdue notice (invoice-overdue-handler): Gmail, to the
 * client's portal login, falling back to the client company's contact email.
 *
 * Rules:
 *   - the caller must be an active primary admin or admin of the invoice's workspace -
 *     reminding a client about money is billing, which managers don't do;
 *   - only issued, unpaid invoices (`due` / `overdue`);
 *   - never from the shared demo workspace, whose client inboxes aren't real;
 *   - at most one reminder per invoice per 24 hours. Each one is written to activity_events,
 *     which is both the record and the throttle.
 *
 * Called with the user's own token (verify_jwt = true): reads go through RLS as the caller.
 * The service-role client is used only for what a user token can't do - looking up the
 * client login's email and writing the activity row.
 */

const REMINDER_COOLDOWN_HOURS = 24
const EVENT_TYPE = 'invoice_reminder_sent'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function getGmailAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('G_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('G_CLIENT_SECRET') ?? '',
      refresh_token: Deno.env.get('G_REFRESH_TOKEN') ?? '',
      grant_type: 'refresh_token',
    }),
  })
  const tokenData = await response.json().catch(() => ({}))
  if (!tokenData.access_token) {
    // Google's own reason (e.g. invalid_grant: "Token has been expired or revoked.") - safe
    // to log, it carries no credentials - so a failure says which secret to fix.
    throw new Error(
      `Failed to get a Gmail access token (HTTP ${response.status}): ${
        tokenData.error ?? 'unknown_error'
      }${tokenData.error_description ? ` - ${tokenData.error_description}` : ''}`
    )
  }
  return tokenData.access_token as string
}

/** base64url of a UTF-8 MIME message. */
function encodeMessage(raw: string): string {
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** RFC 2047 encoded-word, so a subject with non-ASCII (e.g. ₹, é) survives every client. */
function encodeHeader(value: string): string {
  // deno-lint-ignore no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `=?UTF-8?B?${btoa(binary)}?=`
}

async function sendGmail(accessToken: string, to: string, subject: string, html: string) {
  const raw = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n')

  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodeMessage(raw) }),
    }
  )
  if (!response.ok) {
    throw new Error('Gmail refused the message: ' + (await response.text()))
  }
}

function formatAmount(amount: number | string, currency: string): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return `${amount} ${currency}`
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

function formatDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** "elin@nordwave.com" -> "e***@nordwave.com", so the app can say who was emailed. */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  return domain ? `${name.slice(0, 1)}***@${domain}` : '***'
}

type ReminderInvoice = {
  id: string
  invoice_number: string
  amount: number | string
  currency: string
  status: string
  due_date: string | null
  invoice_url: string | null
  org_id: string
  project_id: string
  organizations: { name: string | null; slug: string } | null
  projects: {
    name: string
    client_id: string | null
    client_org_id: string | null
  } | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return json({ error: 'Invalid token' }, 401)

  try {
    if (await isDemoCaller(supabase, user.id)) {
      return json({ error: DEMO_DISABLED }, 403)
    }
  } catch (err) {
    console.error(err)
    return json({ error: 'Could not verify the workspace' }, 500)
  }

  let invoiceId: unknown
  try {
    ;({ invoiceId } = await req.json())
  } catch {
    return json({ error: 'Malformed JSON body' }, 400)
  }
  if (typeof invoiceId !== 'string' || invoiceId.length === 0) {
    return json({ error: 'invoiceId is required' }, 400)
  }

  // Through the caller's token: RLS decides whether they can see this invoice at all.
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(
      `id, invoice_number, amount, currency, status, due_date, invoice_url, org_id, project_id,
       organizations(name, slug),
       projects(name, client_id, client_org_id)`
    )
    .eq('id', invoiceId)
    .maybeSingle<ReminderInvoice>()

  if (invoiceError) {
    console.error('invoice lookup failed:', invoiceError.message)
    return json({ error: 'Could not load the invoice' }, 500)
  }
  if (!invoice) return json({ error: 'Invoice not found' }, 404)

  // Billing roles only.
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', invoice.org_id)
    .eq('status', true)
    .maybeSingle()
  if (!membership || !['primary_admin', 'admin'].includes(membership.role)) {
    return json({ error: 'Only the primary admin or an admin can send reminders' }, 403)
  }

  if (invoice.status !== 'due' && invoice.status !== 'overdue') {
    return json({ error: 'Only sent or overdue invoices can be reminded' }, 409)
  }

  // Throttle: one reminder per invoice per day.
  const since = new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 3_600_000).toISOString()
  const { data: recent, error: recentError } = await admin
    .from('activity_events')
    .select('created_at')
    .eq('entity_type', 'invoice')
    .eq('entity_id', invoice.id)
    .eq('type', EVENT_TYPE)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)

  if (recentError) {
    console.error('reminder history lookup failed:', recentError.message)
    return json({ error: 'Could not check earlier reminders' }, 500)
  }
  if (recent && recent.length > 0) {
    return json(
      {
        error: `A reminder was already sent in the last ${REMINDER_COOLDOWN_HOURS} hours`,
        lastSentAt: recent[0].created_at,
      },
      429
    )
  }

  // Recipient: the client's portal login, else the company's contact email.
  let email: string | null = null
  const clientUserId = invoice.projects?.client_id
  if (clientUserId) {
    const { data } = await admin.auth.admin.getUserById(clientUserId)
    email = data.user?.email ?? null
  }
  if (!email && invoice.projects?.client_org_id) {
    const { data: client } = await admin
      .from('clients')
      .select('contact_email')
      .eq('id', invoice.projects.client_org_id)
      .eq('org_id', invoice.org_id)
      .maybeSingle()
    email = client?.contact_email?.trim() || null
  }
  if (!email) {
    return json({ error: 'This client has no email address to send to' }, 422)
  }

  // Where to pay: Stripe's hosted invoice once issued, otherwise the invoice in the portal.
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')
  const slug = invoice.organizations?.slug
  const payUrl =
    invoice.invoice_url ||
    (appUrl && slug ? `${appUrl}/portal/${slug}/invoices/${invoice.id}` : '')
  if (!payUrl) {
    return json({ error: 'No payment link - set APP_URL for the portal link' }, 500)
  }

  const today = new Date().toISOString().slice(0, 10)
  const isOverdue =
    invoice.status === 'overdue' ||
    (invoice.due_date !== null && invoice.due_date.slice(0, 10) < today)
  const orgName = invoice.organizations?.name ?? 'Foxy HUB'

  try {
    const accessToken = await getGmailAccessToken()
    await sendGmail(
      accessToken,
      email,
      isOverdue
        ? `Invoice ${invoice.invoice_number} is overdue`
        : `Reminder: invoice ${invoice.invoice_number} from ${orgName}`,
      invoiceReminderTemplate({
        orgName,
        projectName: invoice.projects?.name ?? 'your project',
        invoiceNumber: invoice.invoice_number,
        amountLabel: formatAmount(invoice.amount, invoice.currency),
        dueDateLabel: formatDate(invoice.due_date),
        isOverdue,
        payUrl,
      })
    )
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`reminder for ${invoice.invoice_number} failed: ${reason}`)
    // Which half failed decides what to fix: the Google login (G_* secrets) or the send.
    const step = reason.startsWith('Failed to get a Gmail access token')
      ? 'Gmail sign-in failed - check the G_CLIENT_ID / G_CLIENT_SECRET / G_REFRESH_TOKEN secrets'
      : 'Gmail refused the message'
    return json({ error: `The reminder email could not be sent: ${step}` }, 502)
  }

  // The record of the reminder - and what the 24-hour throttle reads next time. A failed
  // write is logged, not returned: the email has already gone.
  const { error: eventError } = await admin.from('activity_events').insert({
    org_id: invoice.org_id,
    actor_id: user.id,
    actor_kind: 'member',
    type: EVENT_TYPE,
    summary: `Payment reminder sent for ${invoice.invoice_number}`,
    project_id: invoice.project_id,
    entity_type: 'invoice',
    entity_id: invoice.id,
    payload: { invoice_number: invoice.invoice_number },
  })
  if (eventError) {
    console.error('could not record the reminder:', eventError.message)
  }

  return json({ ok: true, sentTo: maskEmail(email) }, 200)
})
