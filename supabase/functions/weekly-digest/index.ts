/**
 * weekly-digest — the Monday summary email (Settings → General → Weekly digest).
 *
 * Two ways in:
 *
 *   CRON  `Authorization: Bearer <webhook_secret>` from pg_cron, every hour. Sends to each
 *         person with `user_preferences.weekly_digest` whose LOCAL time is Monday 08:00–11:59
 *         (the window absorbs a missed hourly run; `digest_deliveries` stops a second send).
 *         One email per staff workspace; weeks with nothing to report are skipped.
 *
 *   TEST  `Authorization: Bearer <the user's own access token>`, body `{ orgSlug }`, from
 *         the "Send test" link in Settings. Sends that person's digest for that workspace
 *         now, even if empty, marked [Test], and records nothing.
 *
 * Secrets (supabase secrets set …): webhook_secret, APP_URL, DIGEST_UNSUBSCRIBE_SECRET,
 * and the Google OAuth trio G_CLIENT_ID / G_CLIENT_SECRET / G_REFRESH_TOKEN (shared with
 * invoice-overdue-handler). DIGEST_FROM is optional.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildDigestContent, isEmpty, type DigestOrg, type StaffRole } from './content.ts'
import { getGmailAccessToken, sendGmail } from './gmail.ts'
import { renderDigest, type DigestEmail } from './template.ts'
import { digestWeek, isValidTimeZone, localNow } from './time.ts'
import { unsubscribeUrl } from './token.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const STAFF_ROLES: StaffRole[] = ['primary_admin', 'admin', 'manager', 'contributor']
const MONDAY = 1
const SEND_FROM_HOUR = 8
const SEND_UNTIL_HOUR = 11
/** Keeps one run well inside the Edge Function time limit; the rest go next hour. */
const MAX_RECIPIENTS_PER_RUN = 200

type Config = {
  from: string | undefined
  appUrl: string
  unsubscribeSecret: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function readConfig(): Config | null {
  const appUrl = Deno.env.get('APP_URL')?.replace(/\/+$/, '')
  const unsubscribeSecret = Deno.env.get('DIGEST_UNSUBSCRIBE_SECRET')
  const hasGoogle =
    Deno.env.get('G_CLIENT_ID') &&
    Deno.env.get('G_CLIENT_SECRET') &&
    Deno.env.get('G_REFRESH_TOKEN')
  if (!appUrl || !unsubscribeSecret || !hasGoogle) return null
  return { from: Deno.env.get('DIGEST_FROM') || undefined, appUrl, unsubscribeSecret }
}

/**
 * One Google access token per run, fetched on the first send — a run with nothing due
 * never calls Google at all.
 */
function lazyGmailToken(): () => Promise<string> {
  let token: Promise<string> | null = null
  return () => (token ??= getGmailAccessToken())
}

async function sendEmail(
  config: Config,
  getToken: () => Promise<string>,
  to: string,
  email: DigestEmail,
  unsubscribe: string
): Promise<{ id: string } | { error: string }> {
  try {
    return await sendGmail({
      accessToken: await getToken(),
      from: config.from,
      to,
      email,
      unsubscribeUrl: unsubscribe,
    })
  } catch (err) {
    return { error: (err as Error).message }
  }
}

type Membership = { role: StaffRole; org: DigestOrg }

async function staffMemberships(userId: string): Promise<Membership[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select(
      'role, organizations!inner(id, name, slug, currency, daily_capacity_hours, days_per_week)'
    )
    .eq('user_id', userId)
    .eq('status', true)
    .in('role', STAFF_ROLES)
  if (error) throw error
  return (data ?? []).map((row) => ({
    role: row.role as StaffRole,
    org: row.organizations as unknown as DigestOrg,
  }))
}

async function recipient(userId: string): Promise<{ email: string; firstName: string | null } | null> {
  const [{ data: auth }, { data: profile }] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
  ])
  const email = auth?.user?.email
  if (!email) return null
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null
  return { email, firstName }
}

function zoneOf(prefs: { time_zone: string | null; last_device_time_zone: string | null }): string {
  if (isValidTimeZone(prefs.time_zone)) return prefs.time_zone
  if (isValidTimeZone(prefs.last_device_time_zone)) return prefs.last_device_time_zone
  return 'UTC'
}

// ---------------------------------------------------------------------------------------
// CRON
// ---------------------------------------------------------------------------------------
async function runScheduled(config: Config): Promise<Response> {
  const { data: prefs, error } = await supabase
    .from('user_preferences')
    .select('user_id, time_zone, last_device_time_zone')
    .eq('weekly_digest', true)
  if (error) {
    console.error('weekly-digest: load preferences failed:', error.message)
    return json({ error: 'Query failed' }, 500)
  }

  const due = (prefs ?? [])
    .map((p) => ({ userId: p.user_id as string, local: localNow(zoneOf(p)) }))
    .filter(
      ({ local }) =>
        local.weekday === MONDAY &&
        local.hour >= SEND_FROM_HOUR &&
        local.hour <= SEND_UNTIL_HOUR
    )
    .slice(0, MAX_RECIPIENTS_PER_RUN)

  const summary = { candidates: due.length, sent: 0, skipped: 0, failed: 0 }
  const getToken = lazyGmailToken()

  for (const { userId, local } of due) {
    const week = digestWeek(local)
    try {
      const memberships = await staffMemberships(userId)
      if (!memberships.length) continue

      const { data: done } = await supabase
        .from('digest_deliveries')
        .select('org_id')
        .eq('user_id', userId)
        .eq('week_start', week.weekStart)
        .in('status', ['sent', 'skipped'])
      const doneOrgs = new Set((done ?? []).map((d) => d.org_id as string))
      const pending = memberships.filter((m) => !doneOrgs.has(m.org.id))
      if (!pending.length) continue

      const person = await recipient(userId)
      if (!person) continue
      const unsubscribe = await unsubscribeUrl(config.appUrl, userId, config.unsubscribeSecret)

      for (const { role, org } of pending) {
        const record = (status: 'sent' | 'skipped' | 'failed', extra: { message_id?: string; error?: string } = {}) =>
          supabase.from('digest_deliveries').upsert(
            { user_id: userId, org_id: org.id, week_start: week.weekStart, status, ...extra },
            { onConflict: 'user_id,org_id,week_start' }
          )

        const content = await buildDigestContent(supabase, { userId, role, org, week })
        if (isEmpty(content)) {
          await record('skipped')
          summary.skipped += 1
          continue
        }

        const email = renderDigest({
          firstName: person.firstName,
          orgName: org.name,
          orgSlug: org.slug,
          currency: org.currency,
          appUrl: config.appUrl,
          unsubscribeUrl: unsubscribe,
          week,
          content,
        })
        const result = await sendEmail(
          config,
          getToken,
          person.email,
          email,
          unsubscribe
        )

        if ('id' in result) {
          await record('sent', { message_id: result.id })
          summary.sent += 1
        } else {
          console.error(`weekly-digest: send failed for ${userId}/${org.id}:`, result.error)
          await record('failed', { error: result.error.slice(0, 500) })
          summary.failed += 1
        }
      }
    } catch (err) {
      console.error(`weekly-digest: ${userId} failed:`, (err as Error).message)
      summary.failed += 1
    }
  }

  return json(summary)
}

// ---------------------------------------------------------------------------------------
// TEST — one person, one workspace, right now
// ---------------------------------------------------------------------------------------
async function runTest(config: Config, accessToken: string, req: Request): Promise<Response> {
  const { data: auth, error: authError } = await supabase.auth.getUser(accessToken)
  if (authError || !auth.user) return json({ error: 'Unauthorized' }, 401)
  const userId = auth.user.id

  const body = await req.json().catch(() => ({}))
  const orgSlug = typeof body?.orgSlug === 'string' ? body.orgSlug : null
  if (!orgSlug) return json({ error: 'orgSlug is required' }, 400)

  const membership = (await staffMemberships(userId)).find((m) => m.org.slug === orgSlug)
  if (!membership) return json({ error: 'Not a staff member of that workspace' }, 403)

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('time_zone, last_device_time_zone')
    .eq('user_id', userId)
    .maybeSingle()
  const week = digestWeek(localNow(zoneOf(prefs ?? { time_zone: null, last_device_time_zone: null })))

  const person = await recipient(userId)
  if (!person) return json({ error: 'No email on this account' }, 400)

  const content = await buildDigestContent(supabase, {
    userId,
    role: membership.role,
    org: membership.org,
    week,
  })
  const unsubscribe = await unsubscribeUrl(config.appUrl, userId, config.unsubscribeSecret)
  const email = renderDigest({
    firstName: person.firstName,
    orgName: membership.org.name,
    orgSlug: membership.org.slug,
    currency: membership.org.currency,
    appUrl: config.appUrl,
    unsubscribeUrl: unsubscribe,
    week,
    content,
    isTest: true,
  })

  const result = await sendEmail(
    config,
    lazyGmailToken(),
    person.email,
    email,
    unsubscribe
  )
  if ('error' in result) {
    console.error('weekly-digest test send failed:', result.error)
    return json({ error: 'Send failed' }, 502)
  }
  return json({ ok: true, email: person.email, empty: isEmpty(content) })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const config = readConfig()
  const webhookSecret = Deno.env.get('webhook_secret')
  if (!config || !webhookSecret) {
    console.error(
      'weekly-digest: APP_URL, DIGEST_UNSUBSCRIBE_SECRET, webhook_secret and G_CLIENT_ID / G_CLIENT_SECRET / G_REFRESH_TOKEN must all be set'
    )
    return json({ error: 'Not configured' }, 500)
  }

  const authorization = req.headers.get('Authorization') ?? ''
  if (authorization === `Bearer ${webhookSecret}`) return runScheduled(config)

  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return json({ error: 'Unauthorized' }, 401)
  return runTest(config, token, req)
})
