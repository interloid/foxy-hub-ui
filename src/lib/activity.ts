import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export type ActivityKind = 'system' | 'client' | 'member'

/** One "Field  old -> new" chip under an event in a project's Activity tab. */
export type ActivityChange = {
  label: string
  from: string | null
  to: string
}

export type ActivityInput = {
  orgId: string
  actorId: string | null
  actorKind: ActivityKind
  type: string
  summary: string
  projectId?: string | null
  entityType?: string | null
  entityId?: string | null
  payload?: Record<string, unknown>
  /** Stored in `payload.changes`. */
  changes?: ActivityChange[]
  /** A short quoted line under the event, stored in `payload.note`. */
  note?: string | null
}

export async function logActivity(
  supabase: SupabaseClient,
  input: ActivityInput
): Promise<void> {
  const { error } = await supabase.from('activity_events').insert({
    org_id: input.orgId,
    actor_id: input.actorId,
    actor_kind: input.actorKind,
    type: input.type,
    summary: input.summary,
    project_id: input.projectId ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    payload: {
      ...input.payload,
      ...(input.changes?.length ? { changes: input.changes } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    },
  })

  if (error) {
    console.error(
      `activity_events insert failed (${input.type}):`,
      error.message
    )
  }
}

/**
 * The name an event's sentence starts with. `summary` is written once and never re-rendered,
 * so this is read at the moment of the event, while the name is still true.
 */
export async function actorNameOf(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle()

  return data?.full_name?.trim() || 'Someone'
}
