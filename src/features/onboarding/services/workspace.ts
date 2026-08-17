import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { adminAuthRequest } from '@/lib/supabase/admin'

import type { TeamInvite } from '../types'

export class WorkspaceServiceError extends Error {}

export async function isEmailRegistered(email: string): Promise<boolean> {
  const wanted = email.trim().toLowerCase()
  if (!wanted) return false

  const response = await adminAuthRequest(
    `/admin/users?per_page=200&filter=${encodeURIComponent(wanted)}`
  )
  if (!response.ok) {
    throw new WorkspaceServiceError(`email check failed: ${response.status}`)
  }

  const body = (await response.json()) as {
    users?: { email?: string | null }[]
  }
  return (body.users ?? []).some((user) => user.email?.toLowerCase() === wanted)
}

export async function isSlugAvailable(
  supabase: SupabaseClient,
  candidate: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_slug_available', { candidate })
  if (error)
    throw new WorkspaceServiceError(`slug check failed: ${error.message}`)
  return Boolean(data)
}

export async function startWorkspaceSignup(
  supabase: SupabaseClient,
  params: {
    fullName: string
    email: string
    agencyName: string
    slug: string
    invites: readonly TeamInvite[]
    emailRedirectTo: string
  }
): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: params.email,
    options: {
      data: {
        user_name: params.fullName,
        org_name: params.agencyName,
        slug: params.slug,
        ...(params.invites.length > 0 ? { team_invites: params.invites } : {}),
      },
      emailRedirectTo: params.emailRedirectTo,
    },
  })

  if (error)
    throw new WorkspaceServiceError(`workspace signup failed: ${error.message}`)
}

export function buildSignupNext(
  planName?: string,
  cycle?: 'monthly' | 'yearly'
): string {
  return planName && cycle
    ? `/onboard/complete?plan=${encodeURIComponent(planName)}&cycle=${cycle}`
    : '/'
}
