import 'server-only'

import { getSeatUsage } from '@/features/people/queries'
import { getWorkspace } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'

import type { WorkspaceSettings } from './types'

export async function getWorkspaceSettings(
  orgSlug: string
): Promise<WorkspaceSettings | null> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return null

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [orgRes, seats, invitesRes] = await Promise.all([
    supabase
      .from('organizations')
      .select(
        'id, name, slug, logo_url, daily_capacity_hours, days_per_week, currency, rounding_minutes, user_id'
      )
      .eq('id', workspace.id)
      .maybeSingle(),

    getSeatUsage(workspace.id),

    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', workspace.id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString()),
  ])

  const org = orgRes.data
  if (!org) return null

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logo_url,
    dailyCapacityHours: org.daily_capacity_hours,
    daysPerWeek: org.days_per_week,
    currency: org.currency,
    roundingMinutes: org.rounding_minutes,
    canEdit: Boolean(user && org.user_id === user.id),
    seatsUsed: seats.used,
    seatsTotal: seats.maxMembers,
    pendingInvites: invitesRes.count ?? 0,
  }
}
