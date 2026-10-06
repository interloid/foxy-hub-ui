'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { env } from '@/config/env'
import type { ActionResult } from '@/features/onboarding/types'
import { actorNameOf, logActivity, type ActivityChange } from '@/lib/activity'
import { getWorkspace, verifySession } from '@/lib/dal'
import {
  INACTIVITY_METADATA_KEY,
  INACTIVITY_TIMEOUTS,
  type InactivityTimeout,
} from '@/lib/inactivity'
import { isLocale } from '@/lib/locale'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { isTheme } from '@/lib/theme'
import { isValidTimeZone } from '@/lib/time-zone'
import type { Database } from '@/types/supabase'
import { demoBlocked } from '@/lib/demo'

interface WorkingDayInput {
  dailyCapacityHours: number
  daysPerWeek: number
  currency: string
  roundingMinutes: number
}

const workingDaySchema = z.object(
  {
    dailyCapacityHours: z
      .number('A standard day has to be between 1 and 24 hours.')
      .int('A standard day has to be between 1 and 24 hours.')
      .min(1, 'A standard day has to be between 1 and 24 hours.')
      .max(24, 'A standard day has to be between 1 and 24 hours.'),
    daysPerWeek: z
      .number('Days per week has to be between 1 and 7.')
      .int('Days per week has to be between 1 and 7.')
      .min(1, 'Days per week has to be between 1 and 7.')
      .max(7, 'Days per week has to be between 1 and 7.'),
    currency: z
      .string('Choose a currency.')
      .trim()
      .regex(/^[A-Za-z]{3}$/, 'Choose a currency.')
      .transform((value) => value.toUpperCase()),
    roundingMinutes: z
      .number('Rounding has to be between 1 and 60 minutes.')
      .int('Rounding has to be between 1 and 60 minutes.')
      .min(1, 'Rounding has to be between 1 and 60 minutes.')
      .max(60, 'Rounding has to be between 1 and 60 minutes.'),
  },
  'Check the values and try again.'
)

const workspaceNameSchema = z
  .string('Workspace name is required.')
  .trim()
  .min(1, 'Workspace name is required.')
  .max(80, 'Use 80 characters or fewer.')

/** Plain-language messages for update_workspace_settings' errors. */
function workspaceSettingsError(error: {
  code?: string
  message: string
}): string {
  if (error.code === '42501') {
    return 'Only a primary admin or admin can change workspace settings.'
  }
  if (error.code === '22023' || error.code === '23514') return error.message
  console.error('update workspace settings failed:', error.code, error.message)
  return 'Could not save. Please try again.'
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** The workspace row as it is before a settings save, for the feed's before -> after chips. */
async function readWorkspaceSettings(supabase: ServerClient, orgId: string) {
  const { data } = await supabase
    .from('organizations')
    .select(
      'name, daily_capacity_hours, days_per_week, currency, rounding_minutes'
    )
    .eq('id', orgId)
    .maybeSingle()
  return data
}

/**
 * A Workspace line in the Activity feed - only when something actually changed, so saving
 * an untouched form writes nothing. Never fails the save it records.
 */
async function logWorkspaceChange(
  supabase: ServerClient,
  orgId: string,
  type: string,
  summary: (actor: string) => string,
  changes: ActivityChange[]
) {
  if (changes.length === 0) return
  const session = await verifySession()
  if (!session) return
  await logActivity(supabase, {
    orgId,
    actorId: session.id,
    actorKind: 'member',
    type,
    summary: summary(await actorNameOf(supabase, session.id)),
    entityType: 'organization',
    entityId: orgId,
    changes,
  })
}

/** One chip per field whose value differs; `format` turns the raw value into the label. */
function diff<T>(
  label: string,
  from: T | null | undefined,
  to: T,
  format: (value: T) => string = String
): ActivityChange[] {
  // Compared as text: numeric columns can come back from Postgres as strings.
  if (from !== null && from !== undefined && String(from) === String(to)) {
    return []
  }
  return [
    {
      label,
      from: from === null || from === undefined ? null : format(from),
      to: format(to),
    },
  ]
}

export async function updateWorkingDayAction(
  orgSlug: string,
  input: WorkingDayInput
): Promise<ActionResult> {
  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  const parsed = workingDaySchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? 'Check the values and try again.',
    }
  }

  const supabase = await createClient()
  const before = await readWorkspaceSettings(supabase, workspace.id)
  const { error } = await supabase.rpc('update_workspace_settings', {
    target_org_id: workspace.id,
    new_daily_capacity_hours: parsed.data.dailyCapacityHours,
    new_days_per_week: parsed.data.daysPerWeek,
    new_currency: parsed.data.currency,
    new_rounding_minutes: parsed.data.roundingMinutes,
  })

  if (error) return { ok: false, error: workspaceSettingsError(error) }

  await logWorkspaceChange(
    supabase,
    workspace.id,
    'workspace_settings_changed',
    (actor) => `${actor} changed the working day settings`,
    [
      ...diff(
        'Standard day',
        before?.daily_capacity_hours === undefined
          ? null
          : Number(before.daily_capacity_hours),
        parsed.data.dailyCapacityHours,
        (h) => `${h}h`
      ),
      ...diff('Days per week', before?.days_per_week, parsed.data.daysPerWeek),
      ...diff('Currency', before?.currency, parsed.data.currency),
      ...diff(
        'Time rounding',
        before?.rounding_minutes,
        parsed.data.roundingMinutes,
        (m) => `${m} min`
      ),
    ]
  )

  revalidatePath(`/${orgSlug}/settings`)
  return { ok: true }
}

export async function renameWorkspaceAction(
  orgSlug: string,
  name: string
): Promise<ActionResult> {
  // The name is on every demo page and in the sidebar for all visitors.
  const blocked = await demoBlocked()
  if (blocked) return blocked

  const workspace = await getWorkspace(orgSlug)
  if (!workspace) return { ok: false, error: 'Workspace not found.' }

  const parsed = workspaceNameSchema.safeParse(name)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the name and try again.',
    }
  }

  const supabase = await createClient()
  const before = await readWorkspaceSettings(supabase, workspace.id)
  const { error } = await supabase.rpc('update_workspace_settings', {
    target_org_id: workspace.id,
    new_name: parsed.data,
  })

  if (error) return { ok: false, error: workspaceSettingsError(error) }

  await logWorkspaceChange(
    supabase,
    workspace.id,
    'workspace_renamed',
    (actor) => `${actor} renamed the workspace`,
    diff('Name', before?.name, parsed.data)
  )

  revalidatePath(`/${orgSlug}/settings`, 'layout')
  return { ok: true }
}

const inactivityTimeoutSchema = z.enum(INACTIVITY_TIMEOUTS)

export async function updateInactivityTimeout(
  value: InactivityTimeout
): Promise<ActionResult> {
  const blocked = await demoBlocked()
  if (blocked) return blocked

  const parsed = inactivityTimeoutSchema.safeParse(value)
  if (!parsed.success) return { ok: false, error: 'Choose one of the options.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({
    data: { [INACTIVITY_METADATA_KEY]: parsed.data },
  })

  if (error) {
    console.error('update inactivity timeout failed:', error.message)
    return { ok: false, error: 'Could not save that setting.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function touchActivity(): Promise<void> {}

/** Ends THIS session only — an idle shared machine must not sign out the user's phone. */
export async function signOutInactive(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) console.error('inactivity sign-out failed:', error.message)
}

/** Signs one OTHER device out — `revoke_my_session` refuses the current one. */
export async function signOutDevice(sessionId: string): Promise<ActionResult> {
  const blocked = await demoBlocked()
  if (blocked) return blocked

  const parsed = z.uuid().safeParse(sessionId)
  if (!parsed.success) return { ok: false, error: 'That device was not found.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_my_session', {
    target_session_id: parsed.data,
  })

  if (error) {
    console.error('revoke session failed:', error.message)
    return {
      ok: false,
      error:
        error.code === 'P0002'
          ? 'That device is already signed out.'
          : 'Could not sign that device out.',
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function signOutOtherDevices(): Promise<ActionResult> {
  const blocked = await demoBlocked()
  if (blocked) return blocked

  const supabase = await createClient()
  const { error } = await supabase.auth.signOut({ scope: 'others' })

  if (error) {
    console.error('sign out other sessions failed:', error.message)
    return { ok: false, error: 'Could not sign the other devices out.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

type PreferencesPatch = Omit<
  Database['public']['Tables']['user_preferences']['Update'],
  'user_id' | 'created_at' | 'updated_at'
>

async function savePreferences(
  patch: PreferencesPatch,
  { revalidate = true }: { revalidate?: boolean } = {}
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Your session expired. Sign in again.' }

  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (error) {
    console.error('save preferences failed:', error.code, error.message)
    return { ok: false, error: 'Could not save that setting.' }
  }

  if (revalidate) revalidatePath('/', 'layout')
  return { ok: true }
}

export async function updateTimeZone(
  zone: string | null
): Promise<ActionResult> {
  if (zone !== null && !isValidTimeZone(zone)) {
    return { ok: false, error: 'Choose a time zone from the list.' }
  }
  return savePreferences({ time_zone: zone })
}

/** "Language" — regional formats. */
export async function updateLocale(locale: string): Promise<ActionResult> {
  if (!isLocale(locale)) return { ok: false, error: 'Choose a language.' }
  return savePreferences({ locale })
}

export async function updateTheme(theme: string): Promise<ActionResult> {
  if (!isTheme(theme)) return { ok: false, error: 'Choose a theme.' }
  return savePreferences({ theme }, { revalidate: false })
}

export async function updateWeeklyDigest(
  enabled: boolean
): Promise<ActionResult> {
  // The digest is an email; demo inboxes are not real.
  const blocked = await demoBlocked()
  if (blocked) return blocked

  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'Could not save that setting.' }
  }
  return savePreferences({ weekly_digest: enabled })
}

export async function recordDeviceTimeZone(zone: string): Promise<void> {
  if (!isValidTimeZone(zone)) return
  await savePreferences({ last_device_time_zone: zone }, { revalidate: false })
}

export async function sendTestDigest(
  orgSlug: string
): Promise<ActionResult<{ email: string }>> {
  const blocked = await demoBlocked()
  if (blocked) return blocked

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!user || !session) {
    return { ok: false, error: 'Your session expired. Sign in again.' }
  }

  const allowed = await rateLimit(`digest-test:${user.id}`, {
    limit: 3,
    windowMs: 10 * 60_000,
  })
  if (!allowed) {
    return {
      ok: false,
      error: 'Test sent recently. Try again in a few minutes.',
    }
  }

  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/weekly-digest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orgSlug }),
      }
    )
    const body = (await response.json().catch(() => ({}))) as {
      email?: string
      error?: string
    }

    if (!response.ok || !body.email) {
      console.error('send test digest failed:', response.status, body.error)
      return {
        ok: false,
        error:
          response.status === 500
            ? 'The weekly digest is not set up yet.'
            : 'Could not send the test digest.',
      }
    }

    return { ok: true, data: { email: body.email } }
  } catch (err) {
    console.error('send test digest failed:', (err as Error).message)
    return { ok: false, error: 'Could not send the test digest.' }
  }
}
