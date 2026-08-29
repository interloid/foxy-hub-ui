import { toISODate } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const type = searchParams.get('type')
    const orgSlug = searchParams.get('orgSlug')

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      console.error('Supabase auth error:', authError)

      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      )
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Fetch Milestones for a Project
    if (type === 'milestones') {
      const projectId = searchParams.get('projectId')

      if (!projectId) {
        return NextResponse.json([])
      }

      const { data, error } = await supabase
        .from('milestones')
        .select('id, title')
        .eq('project_id', projectId)
        .order('title', { ascending: true })

      if (error) {
        console.error('Failed to fetch milestones:', error)

        return NextResponse.json(
          { error: 'Failed to fetch milestones' },
          { status: 500 }
        )
      }

      return NextResponse.json(data ?? [])
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

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('daily_capacity_hours')
        .eq('slug', orgSlug)
        .maybeSingle()

      if (orgError) {
        console.error('Failed to fetch organization capacity:', orgError)

        return NextResponse.json(
          { error: 'Failed to fetch organization capacity' },
          { status: 500 }
        )
      }

      const dailyCapacityHours = orgData?.daily_capacity_hours ?? 8

      const { data: entries, error: entriesError } = await supabase
        .from('time_entries')
        .select('duration_minutes')
        .eq('user_id', user.id)
        .eq('work_date', dateStr)

      if (entriesError) {
        console.error('Failed to fetch time entries:', entriesError)

        return NextResponse.json(
          { error: 'Failed to fetch time entries' },
          { status: 500 }
        )
      }

      const alreadyLoggedMinutes =
        entries?.reduce(
          (sum, entry) => sum + (Number(entry.duration_minutes) || 0),
          0
        ) ?? 0

      return NextResponse.json({
        dailyCapacityHours,
        alreadyLoggedMinutes,
      })
    }

    // 3. Check Teammate Allocation Capacity
    if (type === 'teammate-capacity') {
      const userId = searchParams.get('userId')

      const dateStr = searchParams.get('dateStr') || toISODate(new Date())

      if (!userId || !orgSlug) {
        return NextResponse.json({
          userId: userId ?? '',
          existingHoursPerDay: 0,
          maxDailyCapacity: 8,
          maxDaysPerWk: 5,
        })
      }

      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('daily_capacity_hours, days_per_week')
        .eq('slug', orgSlug)
        .maybeSingle()

      if (orgError) {
        console.error('Failed to fetch organization settings:', orgError)

        return NextResponse.json(
          { error: 'Failed to fetch organization settings' },
          { status: 500 }
        )
      }

      const maxDailyCapacity = Number(orgData?.daily_capacity_hours) || 8

      const maxDaysPerWk = Number(orgData?.days_per_week) || 5

      const { data: allocations, error: allocationError } = await supabase
        .from('project_allocations')
        .select('hours_per_day')
        .eq('user_id', userId)
        .lte('effective_from', dateStr)
        .or(`effective_to.is.null,effective_to.gte.${dateStr}`)

      if (allocationError) {
        console.error('Failed to fetch project allocations:', allocationError)

        return NextResponse.json(
          {
            error: 'Failed to fetch project allocations',
          },
          { status: 500 }
        )
      }

      const existingHoursPerDay =
        allocations?.reduce(
          (sum, allocation) => sum + (Number(allocation.hours_per_day) || 0),
          0
        ) ?? 0

      return NextResponse.json({
        userId,
        existingHoursPerDay,
        maxDailyCapacity,
        maxDaysPerWk,
      })
    }

    // 4. Fetch Client Options
    if (type === 'clients') {
      const { data: membership, error: membershipError } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .single()

      if (membershipError) {
        console.error('Failed to fetch user membership:', membershipError)

        return NextResponse.json(
          { error: 'Failed to fetch user membership' },
          { status: 500 }
        )
      }

      if (!membership?.org_id) {
        return NextResponse.json([])
      }

      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('org_id', membership.org_id)
        .order('name', { ascending: true })

      if (error) {
        console.error('Failed to fetch clients:', error)

        return NextResponse.json(
          { error: 'Failed to fetch clients' },
          { status: 500 }
        )
      }

      return NextResponse.json(data ?? [])
    }

    // 5. Fetch Team Member Options
    if (type === 'team-members') {
      const { data: userMembership, error: membershipError } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .single()

      if (membershipError) {
        console.error('Failed to fetch user membership:', membershipError)

        return NextResponse.json(
          { error: 'Failed to fetch user membership' },
          { status: 500 }
        )
      }

      if (!userMembership?.org_id) {
        return NextResponse.json([])
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from('memberships')
        .select('user_id, role')
        .eq('org_id', userMembership.org_id)
        .neq('role', 'client')

      if (membershipsError) {
        console.error('Failed to fetch team memberships:', membershipsError)

        return NextResponse.json(
          { error: 'Failed to fetch team members' },
          { status: 500 }
        )
      }

      if (!memberships?.length) {
        return NextResponse.json([])
      }

      const userIds = memberships.map((membership) => membership.user_id)

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)

      if (profilesError) {
        console.error('Failed to fetch team profiles:', profilesError)

        return NextResponse.json(
          { error: 'Failed to fetch team profiles' },
          { status: 500 }
        )
      }

      const profileMap = new Map(
        profiles?.map((profile) => [profile.id, profile.full_name]) ?? []
      )

      const result = memberships.map((membership) => {
        const fullName =
          profileMap.get(membership.user_id) ?? 'Unnamed Teammate'

        const role = membership.role
          ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1)
          : 'Member'

        return {
          id: membership.user_id,
          name: `${fullName} · ${role}`,
          role: membership.role,
        }
      })

      return NextResponse.json(result)
    }

    // 6. Fetch Projects for Org
    if (type === 'projects') {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) {
        console.error('Failed to fetch projects:', error)

        return NextResponse.json(
          { error: 'Failed to fetch projects' },
          { status: 500 }
        )
      }

      return NextResponse.json(data ?? [])
    }

    return NextResponse.json({ error: 'Invalid query type' }, { status: 400 })
  } catch (error) {
    console.error('GET /api/dashboard/sheet-data failed:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}
