import type { InvitableStaffRole } from '@/lib/role'

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

export type TeamInvite = {
  email: string
  role: InvitableStaffRole | 'Client'
  fullName?: string
  /**
   * Staff invitations only. Rides the `invitations` row because that is the ONLY thing
   * `handle_new_user_signup` trusts when it builds the membership — so a title not stored
   * here can never reach `memberships.job_title`.
   */
  jobTitle?: string
  /** Client invitations only: the project they get portal access to on acceptance. */
  projectId?: string
}

export type InviteOutcome = {
  created: number
  emailed: number
  failed: string[]
}
