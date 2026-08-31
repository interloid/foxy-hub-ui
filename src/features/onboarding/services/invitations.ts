import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
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
      role: invite.role,
    }))
    .filter((invite) => invite.email.length > 0)

  let created = 0
  let emailed = 0
  const failed: string[] = []

  for (const invite of wanted) {
    const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`

    const { data: row, error: insertError } = await supabase
      .from('invitations')
      .insert({
        org_id: params.orgId,
        email: invite.email,
        role: invite.role.toLowerCase(),
        token_hash: await sha256Hex(rawToken),
        invited_by: params.invitedBy,
      })
      .select('id')
      .single()

    if (insertError || !row) {
      console.error(
        `invite row failed for ${invite.email}:`,
        insertError?.message
      )
      failed.push(invite.email)
      continue
    }
    created++

    const { error: mailError } = await admin.auth.admin.inviteUserByEmail(
      invite.email,
      {
        data: { invite_token: rawToken },
        redirectTo: `${params.siteUrl}/set-password`,
      }
    )

    if (mailError) {
      console.error(
        `invite email failed for ${invite.email}:`,
        mailError.message
      )
      await supabase.from('invitations').delete().eq('id', row.id)
      created--
      failed.push(invite.email)
      continue
    }
    emailed++
  }

  return { created, emailed, failed }
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
