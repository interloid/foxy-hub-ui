import 'server-only'

import type { ActivityChange } from '@/lib/activity'
import {
  changesOf,
  noteOf,
} from '@/features/activity/queries/get-workspace-activity'
import { createClient } from '@/lib/supabase/server'

const ACTIVITY_LIMIT = 50

export interface ProjectActivityItem {
  id: string
  summary: string
  actorKind: 'system' | 'client' | 'member'
  createdAt: string
  /** "Field  old -> new" chips, from `payload.changes`. */
  changes: ActivityChange[]
  /** The quoted line under the event, from `payload.note`. */
  note: string | null
}

/** The project's slice of `activity_events`, newest first. */
export async function getProjectActivity(
  projectId: string
): Promise<ProjectActivityItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('activity_events')
    .select('id, summary, actor_kind, created_at, payload')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LIMIT)

  if (error) throw new Error(error.message)

  return (data ?? []).map((ev) => ({
    id: ev.id,
    summary: ev.summary,
    actorKind: ev.actor_kind,
    createdAt: ev.created_at,
    changes: changesOf(ev.payload),
    note: noteOf(ev.payload),
  }))
}
