import 'server-only'

import type { ActivityChange } from '@/lib/activity'
import { createClient } from '@/lib/supabase/server'

import { type ActivityCategory, categoryOf } from '../lib/categories'

/**
 * How far back the page reaches. Filtering and search run in the browser over this window,
 * like the Invoices table; server-side paging goes here if a workspace outgrows it.
 */
const ACTIVITY_LIMIT = 500

export interface WorkspaceActivityItem {
  id: string
  summary: string
  category: ActivityCategory
  actorKind: 'system' | 'client' | 'member'
  /** null for system events (Stripe, scheduled jobs). */
  actorId: string | null
  actorName: string
  createdAt: string
  changes: ActivityChange[]
  note: string | null
}

// `payload` is jsonb written by several places over time, so it is read defensively.
export function changesOf(payload: unknown): ActivityChange[] {
  const raw = (payload as { changes?: unknown } | null)?.changes
  if (!Array.isArray(raw)) return []
  return raw.flatMap((c) =>
    c && typeof c.label === 'string' && typeof c.to === 'string'
      ? [
          {
            label: c.label,
            from: typeof c.from === 'string' ? c.from : null,
            to: c.to,
          },
        ]
      : []
  )
}

export function noteOf(payload: unknown): string | null {
  const note = (payload as { note?: unknown } | null)?.note
  return typeof note === 'string' && note.trim() ? note.trim() : null
}

/** The workspace's audit trail, newest first. `activity_events` RLS admits staff only. */
export async function getWorkspaceActivity(
  orgId: string
): Promise<WorkspaceActivityItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('activity_events')
    .select('id, type, summary, actor_id, actor_kind, created_at, payload')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LIMIT)

  if (error) throw new Error(error.message)
  const events = data ?? []

  // `actor_id` references auth.users, not profiles, so names come from one extra read.
  const actorIds = [
    ...new Set(events.flatMap((e) => (e.actor_id ? [e.actor_id] : []))),
  ]
  const names = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds)
    if (profilesError) {
      console.error('activity actors:', profilesError.message)
    }
    for (const p of profiles ?? []) {
      if (p.full_name?.trim()) names.set(p.id, p.full_name.trim())
    }
  }

  return events.map((ev) => ({
    id: ev.id,
    summary: ev.summary,
    category: categoryOf(ev.type),
    actorKind: ev.actor_kind,
    actorId: ev.actor_id,
    actorName: ev.actor_id
      ? (names.get(ev.actor_id) ?? 'Former member')
      : 'System',
    createdAt: ev.created_at,
    changes: changesOf(ev.payload),
    note: noteOf(ev.payload),
  }))
}
