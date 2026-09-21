'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/features/onboarding/types'
import { getWorkspace } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'

interface WorkingDayInput {
  dailyCapacityHours: number
  daysPerWeek: number
  currency: string
  roundingMinutes: number
}

function validate(input: WorkingDayInput): string | undefined {
  const { dailyCapacityHours, daysPerWeek, currency, roundingMinutes } = input

  if (
    !Number.isInteger(dailyCapacityHours) ||
    dailyCapacityHours < 1 ||
    dailyCapacityHours > 24
  ) {
    return 'A standard day has to be between 1 and 24 hours.'
  }

  if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
    return 'Days per week has to be between 1 and 7.'
  }

  if (currency.trim().length !== 3) {
    return 'Choose a currency.'
  }

  if (
    !Number.isInteger(roundingMinutes) ||
    roundingMinutes < 1 ||
    roundingMinutes > 60
  ) {
    return 'Rounding has to be between 1 and 60 minutes.'
  }

  return undefined
}

export async function updateWorkingDayAction(
  orgSlug: string,
  input: WorkingDayInput
): Promise<ActionResult> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  const invalid = validate(input)
  if (invalid) return { ok: false, error: invalid }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organizations')
    .update({
      daily_capacity_hours: input.dailyCapacityHours,
      days_per_week: input.daysPerWeek,
      currency: input.currency.trim().toUpperCase(),
      rounding_minutes: input.roundingMinutes,
    })
    .eq('id', workspace.id)
    .select('id')

  if (error) {
    return { ok: false, error: 'Could not save. Please try again.' }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'Only the person who created this workspace can change it.',
    }
  }

  revalidatePath(`/${orgSlug}/settings`)
  return { ok: true }
}

export async function renameWorkspaceAction(
  orgSlug: string,
  name: string
): Promise<ActionResult> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  if (!name.trim()) return { ok: false, error: 'Workspace name is required.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organizations')
    .update({ name: name.trim() })
    .eq('id', workspace.id)
    .select('id')

  if (error) {
    return { ok: false, error: 'Could not save. Please try again.' }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'Only the person who created this workspace can rename it.',
    }
  }

  revalidatePath(`/${orgSlug}/settings`, 'layout')
  return { ok: true }
}
