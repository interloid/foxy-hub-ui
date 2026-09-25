import 'server-only'

import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type LandingResult =
  { ok: true; redirectTo: string } | { ok: false; error: string }

/**
 * Where a freshly signed-in user lands. Must run on a session that can READ memberships —
 * for a two-factor user that is only after the code (the restrictive MFA policy hides every
 * row from an aal1 session), which is why the code page calls this too.
 */
export async function resolveLanding(
  supabase: ServerClient,
  userId: string
): Promise<LandingResult> {
  // Every membership, not just the newest one: somebody deactivated at one agency may still
  // be active at another, and they should land in the workspace they can still use.
  // `view_own_membership` lets a user read their own rows whatever their status, so this
  // needs no RPC — the flag is readable right here.
  const { data: memberships, error: membershipError } = await supabase
    .from('memberships')
    .select('status, organizations(slug)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (membershipError) {
    return { ok: true, redirectTo: '/onboard' }
  }

  const rows = memberships ?? []
  const activeRows = rows.filter((row) => row.status)

  // Memberships, but none of them live. Without this they would fall through to /onboard and
  // be invited to create a fresh workspace, which is the opposite of being deactivated. The
  // session is dropped too, since RLS would hand them an empty app rather than an explanation.
  if (rows.length > 0 && activeRows.length === 0) {
    await supabase.auth.signOut()
    return {
      ok: false,
      error: 'Your access to this workspace has been removed.',
    }
  }

  const orgSlug = activeRows
    .map((row) => (row.organizations as { slug: string } | null)?.slug)
    .find(Boolean)

  return { ok: true, redirectTo: orgSlug ? `/${orgSlug}` : '/onboard' }
}
