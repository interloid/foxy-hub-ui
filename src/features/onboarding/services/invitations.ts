import type { SupabaseClient } from '@supabase/supabase-js'
import 'server-only'
import type { InviteOutcome, TeamInvite } from '../types'

export async function sendInvitations(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  params: {
    orgId: string
    invitedBy: string
    invites: readonly TeamInvite[]
    siteUrl: string
  }
): Promise<InviteOutcome> {
  const wanted = params.invites
    .map((invite) => ({
      email: invite.email.trim().toLowerCase(),
      role: invite.role.toLowerCase(),
    }))
    .filter((invite) => invite.email.length > 0)

  const results = await Promise.all(
    wanted.map(async (invite) => {
      const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`
      const tokenHash = await sha256Hex(rawToken)

      // Use admin client to insert into `invitations` table
      const { data: row, error: insertError } = await admin
        .from('invitations')
        .upsert(
          {
            org_id: params.orgId,
            email: invite.email,
            role: invite.role,
            token_hash: tokenHash,
            invited_by: params.invitedBy,
          },
          { onConflict: 'org_id,email' }
        )
        .select('id')
        .single()

      if (insertError || !row) {
        console.error(
          `Invitation row insert failed for ${invite.email}:`,
          insertError?.message
        )

        return {
          email: invite.email,
          created: false,
          emailed: false,
        }
      }

      // Dispatch invite email via Supabase Auth Admin API
      const { error: mailError } = await admin.auth.admin.inviteUserByEmail(
        invite.email,
        {
          data: { invite_token: rawToken, org_id: params.orgId },
          redirectTo: `${params.siteUrl}/set-password`,
        }
      )

      if (mailError) {
        console.error(
          `Invite email failed for ${invite.email}:`,
          mailError.message
        )

        // Delete using admin client to guarantee cleanup regardless of RLS policies
        await admin.from('invitations').delete().eq('id', row.id)

        return {
          email: invite.email,
          created: false,
          emailed: false,
        }
      }

      return {
        email: invite.email,
        created: true,
        emailed: true,
      }
    })
  )

  return {
    created: results.filter((result) => result.created).length,
    emailed: results.filter((result) => result.emailed).length,
    failed: results
      .filter((result) => !result.created || !result.emailed)
      .map((result) => result.email),
  }
}

export async function findOwnedOrgId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()
  return (data?.org_id as string | undefined) ?? null
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
