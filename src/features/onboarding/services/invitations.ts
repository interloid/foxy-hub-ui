import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
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
    /**
     * The workspace the invitee is joining. The link they land on is built from this per
     * person, because a client belongs in the portal and staff belong in the app — one
     * `nextPath` for the whole batch could not serve a mixed invite.
     */
    orgSlug?: string
  }
): Promise<InviteOutcome> {
  // Reaches the template as {{ .RedirectTo }}, so it is the destination itself rather than
  // a callback URL — /auth/confirm verifies the token server-side and carries this through
  // set-password as `next`.
  const landingFor = (role: string) => {
    if (!params.orgSlug) return `${params.siteUrl}/`

    return role === 'client'
      ? `${params.siteUrl}/portal/${params.orgSlug}`
      : `${params.siteUrl}/${params.orgSlug}`
  }

  const wanted = params.invites
    .map((invite) => ({
      email: invite.email.trim().toLowerCase(),
      role: invite.role.toLowerCase(),
      fullName: invite.fullName?.trim() || null,
      jobTitle: invite.jobTitle?.trim() || null,
      projectId: invite.projectId || null,
    }))
    .filter((invite) => invite.email.length > 0)

  const results = await Promise.all(
    wanted.map(async (invite) => {
      const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`
      const tokenHash = await sha256Hex(rawToken)

      await supabase
        .from('invitations')
        .delete()
        .eq('org_id', params.orgId)
        .eq('email', invite.email)
        .is('accepted_at', null)

      const { data: row, error: insertError } = await supabase
        .from('invitations')
        .insert({
          org_id: params.orgId,
          project_id: invite.projectId,
          email: invite.email,
          role: invite.role,
          job_title: invite.jobTitle,
          token_hash: tokenHash,
          invited_by: params.invitedBy,
        })
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

      // Sent with the admin API rather than signInWithOtp: that issues a PKCE
      // link whose verifier lives in the INVITER's browser, so the invitee could
      // never redeem it. This token is stateless and works in any browser.
      //
      // `invite_token` is what makes handle_new_user_signup take its INVITED branch —
      // without it the trigger reads org_name/slug and builds a whole new workspace.
      // `user_name` is what it writes into profiles.full_name.
      //
      // NOT awaited. `after()` runs this once the response has been flushed, so the
      // caller gets its answer as soon as the invitation row exists rather than waiting
      // on SMTP. That wait is the whole delay: a measured Gmail handshake is ~2.45s to
      // connect + EHLO + STARTTLS + EHLO, before AUTH or the message itself — so the
      // "Invite sent" toast was arriving several seconds after the click.
      //
      // The row is the source of truth and is already committed above, so a slow or
      // failed send never costs us the invitation. What it does cost is the old
      // delete-on-failure path: the response is gone by the time we know, so a failure
      // now leaves a row that shows up under Pending invites with no mail delivered.
      // That is the trade — it is logged loudly, and re-inviting replaces the row.
      after(async () => {
        const { error: mailError } = await admin.auth.admin.inviteUserByEmail(
          invite.email,
          {
            data: {
              invite_token: rawToken,
              org_id: params.orgId,
              ...(invite.fullName ? { user_name: invite.fullName } : {}),
            },
            redirectTo: landingFor(invite.role),
          }
        )

        if (mailError) {
          console.error(
            `Invite email failed for ${invite.email} (invitation ${row.id} left pending):`,
            mailError.message
          )
        }
      })

      return {
        email: invite.email,
        created: true,
        // "handed to the mailer", not "accepted by the SMTP server" — see above.
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
    .eq('role', 'primary_admin')
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
