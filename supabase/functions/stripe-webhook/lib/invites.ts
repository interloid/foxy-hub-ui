import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { supabase } from './clients.ts'

/** Invitations chosen at sign-up, carried in the checkout session's metadata. */
export type PendingInviteJob = {
  orgId: string
  userId: string
  raw: string
}

/**
 * Server-side helper to record pending invitations into `invitations`, send emails, and clear user metadata
 */
export async function redeemPendingInvites(
  supabaseClient: SupabaseClient,
  orgId: string,
  userId: string,
  invites: Array<{ email: string; role?: string }>
) {
  const siteUrl = Deno.env.get('SITE_URL') || ''

  for (const invite of invites) {
    if (!invite.email) continue

    const email = invite.email.trim().toLowerCase()
    const role = (invite.role || 'contributor').toLowerCase()

    const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`

    // Hash token using Web Crypto API
    const encoder = new TextEncoder()
    const data = encoder.encode(rawToken)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const tokenHash = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    // 1. Insert invitation record into `invitations` table.
    //
    // NOT an upsert with `onConflict: 'org_id,email'` — no such unique constraint
    // exists. The only thing guarding duplicates is
    //   create unique index invitations_pending_email_org_key
    //     on public.invitations (org_id, lower(email)) where accepted_at is null
    // a PARTIAL index on an EXPRESSION, which PostgREST's on_conflict cannot name;
    // asking for one made every insert fail with 42P10 ("no unique or exclusion
    // constraint matching the ON CONFLICT specification"), which threw before the
    // subscription update below ever ran.
    //
    // Superseding the outstanding invite by hand reproduces what the upsert intended:
    // re-inviting reissues the token, while an ALREADY ACCEPTED invite is left alone
    // (accepted_at is not null), so a redeemed invitation can never be silently reset.
    await supabaseClient
      .from('invitations')
      .delete()
      .eq('org_id', orgId)
      .eq('email', email)
      .is('accepted_at', null)

    const { data: row, error: inviteError } = await supabaseClient
      .from('invitations')
      .insert({
        org_id: orgId,
        email: email,
        role: role,
        token_hash: tokenHash,
        invited_by: userId || null,
      })
      .select('id')
      .single()

    if (inviteError || !row) {
      console.error(
        `Failed to create invitation for ${email}:`,
        inviteError?.message
      )
      throw new Error(`Invitation insertion failed: ${inviteError?.message}`)
    }

    // 2. Dispatch invitation email via Supabase Auth Admin API
    const { error: mailError } =
      await supabaseClient.auth.admin.inviteUserByEmail(email, {
        data: { invite_token: rawToken, org_id: orgId },
        redirectTo: `${siteUrl}/set-password`,
      })

    if (mailError) {
      console.error(
        `Failed to dispatch invite email to ${email}:`,
        mailError.message
      )
      // Roll back invitation row if mail dispatch fails
      await supabaseClient.from('invitations').delete().eq('id', row.id)
      throw new Error(`Invitation email dispatch failed: ${mailError.message}`)
    }
  }

  // 3. Clear pending_invitations from user_metadata
  if (userId) {
    const { error: userUpdateError } =
      await supabaseClient.auth.admin.updateUserById(userId, {
        user_metadata: { pending_invitations: [] },
      })

    if (userUpdateError) {
      console.warn(
        `Failed to clear pending_invitations for user ${userId}:`,
        userUpdateError.message
      )
    }
  }
}

/**
 * Runs after the billing writes, so they are already committed. Still throws on failure,
 * which releases the event claim and lets Stripe retry — and every billing write is
 * idempotent (same row, same values), so a retry re-applies them safely.
 */
export async function runPendingInvites(job: PendingInviteJob) {
  try {
    const parsedInvites = JSON.parse(job.raw)
    if (Array.isArray(parsedInvites) && parsedInvites.length > 0) {
      await redeemPendingInvites(supabase, job.orgId, job.userId, parsedInvites)
      console.log(
        `Successfully processed ${parsedInvites.length} pending invitations for org ${job.orgId}`
      )
    }
  } catch (invErr) {
    const invErrMessage =
      invErr instanceof Error ? invErr.message : String(invErr)
    console.error('Error processing pending_invitations:', invErrMessage)
    throw invErr
  }
}
