import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export type ActivityKind = 'system' | 'client' | 'member'

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
    payload: input.payload ?? {},
  })

  if (error) {
    console.error(
      `activity_events insert failed (${input.type}):`,
      error.message
    )
  }
}
