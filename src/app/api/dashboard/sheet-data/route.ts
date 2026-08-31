import {
  getClients,
  getMilestones,
  getOrganizationCapacity,
  getProjects,
  getTeammateCapacity,
  getTeamMembers,
} from '@/features/dashboard/actions'
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
      console.error('Supabase auth error:', authError.message)
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      )
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Guard: orgSlug is required for all query types
    if (!orgSlug) {
      return NextResponse.json(
        { error: 'Missing required orgSlug query parameter' },
        { status: 400 }
      )
    }

    // 1. Fetch Milestones for a Project
    if (type === 'milestones') {
      const projectId = searchParams.get('projectId')

      if (!projectId) {
        return NextResponse.json([])
      }

      const milestones = await getMilestones(projectId, orgSlug)
      return NextResponse.json(milestones ?? [])
    }

    // 2. Fetch Capacity and Logged Minutes for a User on a specific date
    if (type === 'capacity') {
      const dateStr = searchParams.get('dateStr')

      if (!dateStr) {
        return NextResponse.json({
          dailyCapacityHours: 8,
          alreadyLoggedMinutes: 0,
        })
      }

      const capacityData = await getOrganizationCapacity(orgSlug, dateStr)
      return NextResponse.json(capacityData)
    }

    // 3. Check Teammate Allocation Capacity
    if (type === 'teammate-capacity') {
      const userId = searchParams.get('userId')
      const dateStr = searchParams.get('dateStr') || toISODate(new Date())

      if (!userId) {
        return NextResponse.json({
          userId: '',
          existingHoursPerDay: 0,
          maxDailyCapacity: 8,
          maxDaysPerWk: 5,
        })
      }

      const capacityData = await getTeammateCapacity(userId, orgSlug, dateStr)
      return NextResponse.json(capacityData)
    }

    // 4. Fetch Client Options
    if (type === 'clients') {
      const clients = await getClients(orgSlug)
      return NextResponse.json(clients ?? [])
    }

    // 5. Fetch Team Member Options
    if (type === 'team-members') {
      const teamMembers = await getTeamMembers(orgSlug)
      return NextResponse.json(teamMembers ?? [])
    }

    // 6. Fetch Projects for Org
    if (type === 'projects') {
      const projects = await getProjects(orgSlug)
      return NextResponse.json(projects ?? [])
    }

    return NextResponse.json({ error: 'Invalid query type' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('GET /api/dashboard/sheet-data failed:', message)

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
