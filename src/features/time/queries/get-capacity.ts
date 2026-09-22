import { toISODate } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

const ROLE_ORDER: Record<string, number> = {
  primary_admin: 1,
  admin: 2,
  manager: 3,
  contributor: 4,
}
export async function getTeamCapacityData(orgId: string) {
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('daily_capacity_hours')
    .eq('id', orgId)
    .single()

  const standardHoursPerDay = org?.daily_capacity_hours ?? 8

  const { data: members } = await supabase
    .from('memberships')
    .select('user_id, role')
    .eq('org_id', orgId)
    .neq('role', 'client')

  const memberUserIds = (members || []).map((m) => m.user_id)

  const profilesMap = new Map<
    string,
    { full_name: string | null; avatar_url: string | null }
  >()

  if (memberUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', memberUserIds)

    profiles?.forEach((profile) => {
      profilesMap.set(profile.id, {
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
      })
    })
  }

  const today = toISODate(new Date())
  const { data: allocations } = await supabase
    .from('project_allocations')
    .select(
      `
      id,
      user_id,
      hours_per_day,
      projects ( id, name )
    `
    )
    .lte('effective_from', today)
    .or(`effective_to.gte.${today},effective_to.is.null`)

  const capacities = (members || [])
    .map((member) => {
      const profile = profilesMap.get(member.user_id)

      const userAllocations = (allocations || [])
        .filter((a) => a.user_id === member.user_id)
        .map((a) => {
          const project = Array.isArray(a.projects) ? a.projects[0] : a.projects

          return {
            id: a.id,
            projectId: project?.id || '',
            projectName: project?.name || 'Unknown Project',
            hoursPerDay: Number(a.hours_per_day),
          }
        })

      return {
        userId: member.user_id,
        fullName: profile?.full_name || 'Unknown User',
        role: member.role,
        avatarUrl: profile?.avatar_url || null,
        allocations: userAllocations,
      }
    })
    .sort((a, b) => {
      const orderA = ROLE_ORDER[a.role.toLowerCase()] ?? 99
      const orderB = ROLE_ORDER[b.role.toLowerCase()] ?? 99
      return orderA - orderB
    })

  return {
    standardHoursPerDay,
    capacities,
  }
}
