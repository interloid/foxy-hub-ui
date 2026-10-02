import type { NewProjectFormData } from '@/features/projects/components/new-project/types'
import { verifySession, type WorkspaceDTO } from '@/lib/dal'
import { roleLabel, STAFF_ROLES } from '@/lib/role'
import { createClient } from '@/lib/supabase/server'

// Everything the full-page New project wizard needs up front. Capacity is NOT here: a
// teammate's existing load depends on the date their allocation starts, so the wizard asks
// for it per row (`/api/dashboard/sheet-data?type=teammate-capacity`).
export async function getNewProjectFormData(
  workspace: WorkspaceDTO
): Promise<NewProjectFormData | null> {
  const session = await verifySession()
  if (!session) return null

  const supabase = await createClient()

  const [clientsRes, membershipsRes, orgRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, contact_name')
      .eq('org_id', workspace.id)
      .eq('status', true)
      .order('name', { ascending: true }),
    // Active staff only: a deactivated member can't own a project or be staffed on one,
    // and the RPC rejects an owner who isn't active staff anyway.
    supabase
      .from('memberships')
      .select('user_id, role, default_rate, cost_rate')
      .eq('org_id', workspace.id)
      .eq('status', true)
      .in('role', [...STAFF_ROLES]),
    supabase
      .from('organizations')
      .select('daily_capacity_hours, days_per_week, rounding_minutes')
      .eq('id', workspace.id)
      .maybeSingle(),
  ])

  if (clientsRes.error) {
    console.error('getNewProjectFormData clients:', clientsRes.error.message)
  }
  if (membershipsRes.error) {
    console.error(
      'getNewProjectFormData memberships:',
      membershipsRes.error.message
    )
  }

  const memberships = membershipsRes.data ?? []
  const userIds = memberships.map((m) => m.user_id)

  const { data: profiles, error: profilesError } =
    userIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds)
      : { data: [], error: null }

  if (profilesError) {
    console.error('getNewProjectFormData profiles:', profilesError.message)
  }

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || null])
  )

  // Cost rate is internal pay: only the primary admin may see it.
  const canSeeCost = workspace.role === 'primary_admin'

  const members = memberships
    .map((m) => ({
      id: m.user_id,
      name: nameById.get(m.user_id) || 'Unnamed teammate',
      role: m.role,
      roleLabel: roleLabel(m.role),
      defaultRate: m.default_rate !== null ? Number(m.default_rate) : null,
      costRate: canSeeCost && m.cost_rate !== null ? Number(m.cost_rate) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    clients: (clientsRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      contactName: c.contact_name?.trim() || null,
    })),
    members,
    currentUserId: session.id,
    canSeeCost,
    dailyCapacityHours: orgRes.data?.daily_capacity_hours ?? 8,
    daysPerWeek: orgRes.data?.days_per_week ?? 5,
    roundingMinutes: orgRes.data?.rounding_minutes ?? 15,
  }
}
