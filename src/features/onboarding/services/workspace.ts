import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TeamInvite } from '../types'

export class WorkspaceServiceError extends Error {}

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
        // Read by `create-checkout` (as `user.user_metadata.pending_invitations`) and
        // relayed through the Stripe session metadata so `stripe-webhook` can redeem
        // them once payment actually completes — see set-password-form's "Subscribe"
        // dialog, which tells the user invites wait for that. Must stay named
        // `pending_invitations`; a mismatch here means create-checkout always sees an
        // empty list and no invite is ever sent.
        ...(params.invites.length > 0
          ? { pending_invitations: params.invites }
          : {}),
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
