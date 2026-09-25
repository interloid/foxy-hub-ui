import 'server-only'

import { getSeatUsage } from '@/features/people/queries'
import { getWorkspace, isAdminRole } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'

import { describeDevice, formatLocation } from './devices'
import type { DeviceSession, WorkspaceSettings } from './types'

export async function getWorkspaceSettings(
  orgSlug: string
): Promise<WorkspaceSettings | null> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return null

  const supabase = await createClient()

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
    // Primary admins and admins — the same roles update_workspace_settings allows.
    canEdit: isAdminRole(workspace.role),
    seatsUsed: seats.used,
    seatsTotal: seats.maxMembers,
    pendingInvites: invitesRes.count ?? 0,
  }
}

/** The signed-in user's live sessions, current device first. */
export async function getMyDevices(): Promise<DeviceSession[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_my_sessions')

  if (error) {
    console.error('list sessions failed:', error.message)
    return []
  }

  // Generated types mark these non-null, but a session with no recorded details comes
  // back from the LEFT JOIN with nulls.
  return (data ?? []).map((row) => {
    const { name, kind } = describeDevice(row.user_agent as string | null)
    return {
      sessionId: row.session_id,
      name,
      kind,
      location: formatLocation(
        row.city as string | null,
        row.country as string | null
      ),
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      isCurrent: row.is_current,
    }
  })
}
