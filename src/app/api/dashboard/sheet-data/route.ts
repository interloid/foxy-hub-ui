import { toISODate } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const orgSlug = searchParams.get('orgSlug')
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Fetch Milestones for a Project
  if (type === 'milestones') {
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json([])

    const { data } = await supabase
      .from('milestones')
      .select('id, title')
      .eq('project_id', projectId)
      .order('title', { ascending: true })

    return NextResponse.json(data || [])
  }

  // 2. Fetch Capacity and Logged Minutes for a User on a specific date
  if (type === 'capacity') {
    const dateStr = searchParams.get('dateStr')
    if (!orgSlug || !dateStr) {
      return NextResponse.json({
        dailyCapacityHours: 8,
        alreadyLoggedMinutes: 0,
      })
    }

    const { data: orgData } = await supabase
      .from('organizations')
      .select('daily_capacity_hours')
      .eq('slug', orgSlug)
      .maybeSingle()

    const dailyCapacityHours = orgData?.daily_capacity_hours ?? 8

    const { data: entries } = await supabase
      .from('time_entries')
      .select('duration_minutes')
      .eq('user_id', user.id)
      .eq('work_date', dateStr)

    const alreadyLoggedMinutes =
      entries?.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0) ??
      0

    return NextResponse.json({ dailyCapacityHours, alreadyLoggedMinutes })
  }

  // 3. Check Teammate Allocation Capacity
  if (type === 'teammate-capacity') {
    const userId = searchParams.get('userId')
    const dateStr = searchParams.get('dateStr') || toISODate(new Date())

    if (!userId || !orgSlug) {
      return NextResponse.json({
        userId: userId || '',
        existingHoursPerDay: 0,
        maxDailyCapacity: 8,
        maxDaysPerWk: 5,
      })
    }

    const { data: orgData } = await supabase
      .from('organizations')
      .select('daily_capacity_hours, days_per_week')
      .eq('slug', orgSlug)
      .maybeSingle()

    const maxDailyCapacity = orgData?.daily_capacity_hours ?? 8
    const maxDaysPerWk = orgData?.days_per_week ?? 5

    const { data: allocations, error } = await supabase
      .from('project_allocations')
      .select('hours_per_day')
      .eq('user_id', userId)
      .lte('effective_from', dateStr)
      .or(`effective_to.is.null,effective_to.gte.${dateStr}`)

    if (error || !allocations) {
      return NextResponse.json({
        userId,
        existingHoursPerDay: 0,
        maxDailyCapacity,
        maxDaysPerWk,
      })
    }

    const existingHoursPerDay = allocations.reduce(
      (sum, item) => sum + (Number(item.hours_per_day) || 0),
      0
    )

    return NextResponse.json({
      userId,
      existingHoursPerDay,
      maxDailyCapacity,
      maxDaysPerWk,
    })
  }

  // 4. Fetch Client Options
  if (type === 'clients') {
    const { data: membership } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!membership?.org_id) return NextResponse.json([])

    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('org_id', membership.org_id)
      .order('name', { ascending: true })

    return NextResponse.json(data || [])
  }

  // 5. Fetch Team Member Options
  if (type === 'team-members') {
    const { data: userMembership } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!userMembership?.org_id) return NextResponse.json([])

    const { data: memberships } = await supabase
      .from('memberships')
      .select('user_id, role')
      .eq('org_id', userMembership.org_id)
      .neq('role', 'client')

    if (!memberships || memberships.length === 0) return NextResponse.json([])

    const userIds = memberships.map((m) => m.user_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)

    const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || [])

    const result = memberships.map((item) => {
      const fullName = profileMap.get(item.user_id) || 'Unnamed Teammate'
      const role = item.role
        ? item.role.charAt(0).toUpperCase() + item.role.slice(1)
        : 'Member'

      return {
        id: item.user_id,
        name: `${fullName} · ${role}`,
        role: item.role,
      }
    })

    return NextResponse.json(result)
  }

  // 6. Fetch Projects for Org
  if (type === 'projects') {
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .order('name', { ascending: true })

    return NextResponse.json(data || [])
  }

  return NextResponse.json({ error: 'Invalid query type' }, { status: 400 })
}
