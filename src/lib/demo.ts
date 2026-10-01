import 'server-only'

import { cache } from 'react'

import { serverEnv } from '@/config/env.server'
import {
  DEMO_DISABLED_MESSAGE,
  DEMO_ROLES,
  type DemoRole,
} from '@/features/auth/demo'

import { verifySession } from './dal'
import { createClient } from './supabase/server'

/**
 * The shared demo accounts, one per role, all signing in with DEMO_ACCOUNT_PASSWORD.
 * Emails stay on the server: the browser only ever names a role.
 */
function demoEmails(): Record<DemoRole, string | undefined> {
  return {
    admin: serverEnv.DEMO_ADMIN_EMAIL || undefined,
    manager: serverEnv.DEMO_MANAGER_EMAIL || undefined,
    contributor: serverEnv.DEMO_CONTRIBUTOR_EMAIL || undefined,
    client: serverEnv.DEMO_CLIENT_EMAIL || undefined,
  }
}

export function demoEmailFor(role: DemoRole): string | undefined {
  return serverEnv.DEMO_ACCOUNT_PASSWORD ? demoEmails()[role] : undefined
}

/** The roles the picker can offer - those with an account configured. */
export function enabledDemoRoles(): DemoRole[] {
  return DEMO_ROLES.map(({ role }) => role).filter((role) => demoEmailFor(role))
}

/** Whether an email belongs to one of the shared demo accounts. */
export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const address = email.toLowerCase()
  return Object.values(demoEmails()).some(
    (demo) => demo?.toLowerCase() === address
  )
}

/**
 * Whether the signed-in user is one of the shared demo visitors: a demo account email,
 * or an active member of a demo workspace (`organizations.is_demo`). Cached per request.
 */
export const isDemoUser = cache(async (): Promise<boolean> => {
  const session = await verifySession()
  if (!session) return false
  if (isDemoEmail(session.email)) return true

  const supabase = await createClient()
  const { data } = await supabase
    .from('memberships')
    .select('id, organizations!inner(is_demo)')
    .eq('user_id', session.id)
    .eq('status', true)
    .eq('organizations.is_demo', true)
    .limit(1)

  return Boolean(data?.length)
})

/**
 * The failure a server action returns for a demo visitor, or null to carry on:
 *
 *   const blocked = await demoBlocked()
 *   if (blocked) return blocked
 */
export async function demoBlocked(): Promise<{
  ok: false
  error: string
} | null> {
  return (await isDemoUser())
    ? { ok: false, error: `${DEMO_DISABLED_MESSAGE}.` }
    : null
}
