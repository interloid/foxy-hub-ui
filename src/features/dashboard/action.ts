'use server'
import { createClient } from '@/lib/supabase/server'

export async function getUserName() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'Invalid token.' }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  if (error) {
    return { ok: false, error: error.message }
  }

  const name = data.full_name
    ? data.full_name
    : user.email
      ? user.email.split('@')[0]
      : undefined

  return { ok: true, name }
}
export interface TeammateAllocationCheck {
  userId: string
  existingHoursPerDay: number
  maxDailyCapacity: number
  maxDaysPerWk: number
}
interface CapacityAndLoggedData {
  dailyCapacityHours: number
  alreadyLoggedMinutes: number
}

export async function getDailyCapacityAndLoggedMinutes(
  dateString: string
): Promise<CapacityAndLoggedData> {
  const supabase = await createClient()

  // 1. Get Authenticated User
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { dailyCapacityHours: 8, alreadyLoggedMinutes: 0 }
  }

  // 2. Fetch Org Daily Capacity
  const { data: orgData } = await supabase
    .from('organizations')
    .select('daily_capacity_hours')
    .limit(1)
    .single()

  const dailyCapacityHours = orgData?.daily_capacity_hours ?? 8

  // 3. Fetch Sum of Logged Minutes for Selected Date
  const { data: entries } = await supabase
    .from('time_entries')
    .select('duration_minutes')
    .eq('user_id', user.id)
    .eq('work_date', dateString)

  const alreadyLoggedMinutes =
    entries?.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0) ?? 0

  return { dailyCapacityHours, alreadyLoggedMinutes }
}

export interface ProjectOption {
  id: string
  name: string
}

export interface MilestoneOption {
  id: string
  title: string
}

export async function getProjectsForOrg(): Promise<ProjectOption[]> {
  const supabase = await createClient()

  // Fetch projects belonging to the user's organization
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .order('name', { ascending: true })

  if (error || !data) return []
  return data
}

export async function getMilestonesForProject(
  projectId: string
): Promise<MilestoneOption[]> {
  if (!projectId) return []

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('milestones')
    .select('id, title')
    .eq('project_id', projectId)
    .order('title', { ascending: true })

  if (error || !data) return []
  return data
}

export interface CreateTimeEntryParams {
  projectId: string
  milestoneId?: string | null
  workDate: string
  durationStr: string
  description: string
}

export async function createTimeEntry(params: CreateTimeEntryParams) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'User is not authenticated.' }
  }

  const durationMinutes = parseDurationToMinutes(params.durationStr)
  if (!durationMinutes || durationMinutes <= 0) {
    return { success: false, error: 'Invalid duration specified.' }
  }

  const { error } = await supabase.from('time_entries').insert({
    user_id: user.id,
    project_id: params.projectId,
    milestone_id: params.milestoneId || null,
    work_date: params.workDate,
    duration_minutes: durationMinutes,
    description: params.description.trim(),
    status: 'draft',
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

function parseDurationToMinutes(val: string): number | null {
  const trimmed = val.trim().toLowerCase()
  if (!trimmed || trimmed.includes('-')) return null

  const timeRegex = /^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+)m)?$/
  const timeMatch = trimmed.match(timeRegex)

  if (timeMatch && (timeMatch[1] !== undefined || timeMatch[2] !== undefined)) {
    const hours = timeMatch[1] ? parseFloat(timeMatch[1]) : 0
    const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
    const total = Math.round(hours * 60 + mins)
    return isNaN(total) || total <= 0 ? null : total
  }

  const num = parseFloat(trimmed)
  if (!isNaN(num) && num > 0) {
    return Math.round(num * 60)
  }

  return null
}

export async function getTeammateAllocatedHours(
  userId: string,
  targetDateStr?: string
): Promise<TeammateAllocationCheck> {
  const supabase = await createClient()

  const { data: orgData } = await supabase
    .from('organizations')
    .select('daily_capacity_hours, days_per_week')
    .limit(1)
    .single()

  const maxDailyCapacity = orgData?.daily_capacity_hours ?? 8
  const maxDaysPerWk = orgData?.days_per_week ?? 5
  const evalDate = targetDateStr || new Date().toISOString().split('T')[0]

  const { data: allocations, error } = await supabase
    .from('project_allocations')
    .select('hours_per_day')
    .eq('user_id', userId)
    .lte('effective_from', evalDate)
    .or(`effective_to.is.null,effective_to.gte.${evalDate}`)

  if (error || !allocations) {
    return { userId, existingHoursPerDay: 0, maxDailyCapacity, maxDaysPerWk }
  }

  const existingHoursPerDay = allocations.reduce(
    (sum, item) => sum + (Number(item.hours_per_day) || 0),
    0
  )

  return { userId, existingHoursPerDay, maxDailyCapacity, maxDaysPerWk }
}
