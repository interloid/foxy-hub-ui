import { createClient } from '@/lib/supabase/server'
import { ProjectUpdate } from '../types'
import { createProjectUpdate } from '../data'
import { revalidatePath } from 'next/cache'

export async function getProjectUpdates(
  projectId: string
): Promise<ProjectUpdate[]> {
  const supabase = await createClient()

  // 1. Fetch updates from the public schema
  const { data: updates, error } = await supabase
    .from('updates')
    .select('id, project_id, author_id, body, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error || !updates) {
    console.error('Error fetching project updates:', error)
    return []
  }

  const avatarColors = [
    'bg-success text-brand-white',
    'bg-purple-500 text-brand-white',
    'bg-info text-brand-white',
    'bg-primary text-brand-white',
  ]

  const authorIds = Array.from(
    new Set(updates.map((item) => item.author_id).filter(Boolean))
  )

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', authorIds)

  const profileMap = new Map(
    profiles?.map((p) => [p.id, p.full_name || 'Team Member']) ?? []
  )

  const updatesWithAuthors = updates.map((item, index) => {
    const name = profileMap.get(item.author_id) || 'Team Member'

    const initials = name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()

    return {
      id: item.id,
      projectId: item.project_id,
      authorId: item.author_id,
      authorName: name,
      authorInitials: initials || 'TM',
      avatarColorClass: avatarColors[index % avatarColors.length],
      body: item.body,
      createdAt: item.created_at,
    }
  })

  return updatesWithAuthors
}
