export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

export type TeamInvite = { email: string; role: 'Admin' | 'Member' }

export type InviteOutcome = {
  created: number
  emailed: number
  failed: string[]
}
