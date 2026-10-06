import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Whether the caller is an active member of the shared demo workspace
 * (`organizations.is_demo`) - the same rule as the app's `isDemoUser()`. The functions that
 * reach Stripe or send email refuse these callers, since the app's own guards can be
 * skipped by calling a function directly with the demo login's token.
 *
 * `client` must carry the caller's token: the query relies on `view_own_membership`. Throws
 * when the check cannot run, so a failure refuses the request rather than letting it
 * through.
 */
export async function isDemoCaller(
  client: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('memberships')
    .select('id, organizations!inner(is_demo)')
    .eq('user_id', userId)
    .eq('status', true)
    .eq('organizations.is_demo', true)
    .limit(1)

  if (error) throw new Error(`Could not check for the demo workspace: ${error.message}`)
  return (data?.length ?? 0) > 0
}

export const DEMO_DISABLED = 'Disabled in the demo.'
