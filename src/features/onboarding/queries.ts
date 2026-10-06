import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Seats per plan for the sign-up plan cards, from `plans.seats` - the same column the
 * billing page, plan changes and the invite limit use - so sign-up cannot promise a
 * different number. Keyed by plan id ('starter', 'studio', 'agency'); null = unlimited.
 *
 * Read with the admin client: the visitor is not signed in yet, and `plans` is readable
 * by authenticated users only. Only these public numbers reach the page. Empty on
 * failure - the cards then leave the seats line out rather than guess.
 */
export async function getPlanSeats(): Promise<Record<string, number | null>> {
  try {
    const { data, error } = await createAdminClient()
      .from('plans')
      .select('name, seats')
      .eq('is_active', true)
      .eq('duration_months', 1)
    if (error) throw error
    return Object.fromEntries(
      (data ?? []).map((plan) => [plan.name.toLowerCase(), plan.seats])
    )
  } catch (err) {
    console.error('Could not load plan seats:', (err as Error).message)
    return {}
  }
}
