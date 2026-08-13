export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

/** A teammate row from step 3 of the wizard. Capitalised, as the select renders it. */
export type TeamInvite = { email: string; role: 'Admin' | 'Member' }

/** What `sendInvitations` reports back: counts plus the addresses that did not make it. */
export type InviteOutcome = {
  created: number
  emailed: number
  failed: string[]
}
