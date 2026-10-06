'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import type { ProjectUpdate } from '../types'

export function useRealtimeUpdates(
  initialUpdates: ProjectUpdate[],
  projectId: string,
  limit = 5
) {
  const [realtimeUpdates, setRealtimeUpdates] = useState<ProjectUpdate[]>([])
  const [prevInitial, setPrevInitial] = useState(initialUpdates)

  // Reset realtime updates when initial server props change
  if (initialUpdates !== prevInitial) {
    setPrevInitial(initialUpdates)
    setRealtimeUpdates([])
  }

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`realtime:updates:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'updates',
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          const newRow = payload.new

          // Fetch author details
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', newRow.author_id)
            .maybeSingle()

          const authorName = profile?.full_name || 'Team Member'
          const authorInitials =
            authorName
              .split(' ')
              .filter(Boolean)
              .map((n) => n[0])
              .join('')
              .substring(0, 2)
              .toUpperCase() || 'TM'

          const newUpdate: ProjectUpdate = {
            id: newRow.id,
            projectId: newRow.project_id,
            authorId: newRow.author_id,
            authorName,
            authorInitials,
            avatarColorClass: 'bg-success text-brand-white',
            body: newRow.body,
            createdAt: newRow.created_at,
          }

          setRealtimeUpdates((prev) => [newUpdate, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId])

  // Merge and enforce the 5-item limit
  const combined = [...realtimeUpdates, ...initialUpdates]

  // Deduplicate items in case server revalidates and returns the item pushed by realtime
  const uniqueUpdates = Array.from(
    new Map(combined.map((item) => [item.id, item])).values()
  )

  return uniqueUpdates.slice(0, limit)
}
