import { cache } from 'react'
import { createClient } from './supabase/server'

export type SessionUser = {
  id: string
  email: string | null
}

export type AccountDTO = {
  id: string
  email: string | null
  fullName: string | null
  role: string | null
  initials: string
  isAdmin: boolean
}

export type WorkspaceDTO = {
  id: string
  name: string
  slug: string
  role: string
}

const ADMIN_ROLES: readonly string[] = ['owner', 'admin']

export function isAdminRole(role: string | null | undefined): boolean {
  return role != null && ADMIN_ROLES.includes(role.toLowerCase())
}

export const verifySession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  return { id: user.id, email: user.email ?? null }
})

export const getWorkspace = cache(async (): Promise<WorkspaceDTO | null> => {
  const session = await verifySession()
  if (!session) return null

  const supabase = await createClient()
  // RLS scopes this to orgs the caller belongs to, so no explicit user filter is needed —
  // and adding one would duplicate the policy rather than reinforce it.
  const { data, error } = await supabase
    .from('memberships')
    .select('role, organizations(id, name, slug)')
    .limit(1)
    .maybeSingle()

  if (error || !data?.organizations) return null

  const org = data.organizations as unknown as {
    id: string
    name: string
    slug: string
  }
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    role: data.role as string,
  }
})

export const getAccount = cache(async (): Promise<AccountDTO | null> => {
  const session = await verifySession()
  if (!session) return null

  const supabase = await createClient()

  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', session.id)
    .maybeSingle()

  const workspace = await getWorkspace()

  const role = workspace?.role ?? null

  return {
    id: session.id,
    email: session.email,
    fullName: (data?.full_name as string | null) ?? null,
    role,
    initials: initialsOf(
      (data?.full_name as string | null) ?? null,
      session.email
    ),
    isAdmin: isAdminRole(role),
  }
})

function initialsOf(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split('@')[0] || ''
  const words = source.split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters =
    words.length === 1 ? words[0]!.slice(0, 1) : words[0]![0]! + words[1]![0]!
  return letters.toUpperCase()
}
